-- Transactional reminder mail. Disabled until a verified sender and encrypted
-- API key are configured; no credentials are stored in public site settings.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
REVOKE ALL ON net.http_request_queue,net._http_response FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.dispatch_document_reminder_email() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE q reminder_private.deliveries%ROWTYPE; cfg reminder_private.email_config%ROWTYPE;
  v_key text; v_name text; v_email text; v_support text; v_subject text; v_text text; v_request bigint;
  r record;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('document-reminder-mail-worker',0)) THEN RETURN; END IF;
  -- Reconcile async HTTP responses without logging recipient addresses or tokens.
  FOR r IN SELECT queued.id,queued.attempts,queued.first_attempt_at,response.status_code,response.timed_out,response.error_msg
    FROM reminder_private.deliveries queued JOIN net._http_response response ON response.id=queued.request_id WHERE queued.email_status='sending'
  LOOP
    IF r.status_code BETWEEN 200 AND 299 THEN
      UPDATE reminder_private.deliveries SET email_status='accepted',last_error=NULL WHERE id=r.id;
    ELSIF (r.status_code IS NULL OR r.status_code=429 OR r.status_code>=500) AND r.attempts<5 AND r.first_attempt_at>now()-interval '23 hours' THEN
      UPDATE reminder_private.deliveries SET email_status='queued',next_attempt_at=now()+make_interval(mins=>power(2,r.attempts)::integer),last_error='Temporary email provider error; retry scheduled' WHERE id=r.id;
    ELSE
      UPDATE reminder_private.deliveries SET email_status='failed',last_error='Email provider rejected the request or retries exhausted; review sender configuration' WHERE id=r.id;
    END IF;
  END LOOP;
  -- A missing HTTP response is uncertain, not a successful send. The same
  -- idempotency key is reused only inside the provider's 24-hour dedup window.
  UPDATE reminder_private.deliveries SET email_status=CASE WHEN attempts<5 AND first_attempt_at>now()-interval '23 hours' THEN 'queued' ELSE 'failed' END,
    last_error='Email response was not confirmed',next_attempt_at=now()
    WHERE email_status='sending' AND next_attempt_at<now()-interval '10 minutes';
  SELECT * INTO cfg FROM reminder_private.email_config WHERE id;
  IF NOT cfg.enabled OR NULLIF(cfg.from_email,'') IS NULL THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='document_reminder_resend_key' LIMIT 1;
  IF NULLIF(v_key,'') IS NULL THEN RETURN; END IF;

  -- One request/minute is intentionally below provider burst limits. The queue
  -- survives restarts and concurrent workers claim rows with SKIP LOCKED.
  SELECT * INTO q FROM reminder_private.deliveries WHERE email_status='queued' AND next_attempt_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.document_expiry_items() d WHERE d.source_key=q.source_key AND d.expires_at=q.expires_at AND d.review_status<>'pending'
    AND q.milestone=CASE WHEN d.expires_at<=now() THEN 0 WHEN d.expires_at<=now()+interval '1 day' THEN 1 WHEN d.expires_at<=now()+interval '7 days' THEN 7 ELSE 30 END) THEN
    UPDATE reminder_private.deliveries SET email_status='cancelled' WHERE id=q.id; RETURN;
  END IF;
  IF q.first_attempt_at<now()-interval '23 hours' THEN
    UPDATE reminder_private.deliveries SET email_status='failed',last_error='Uncertain delivery is outside the safe retry window; check provider logs before retrying' WHERE id=q.id; RETURN;
  END IF;
  -- Supabase Auth is the authoritative registered email, never a public profile
  -- field or an address supplied in a document upload request.
  SELECT email INTO v_email FROM auth.users WHERE id=q.user_id;
  IF NULLIF(v_email,'') IS NULL THEN
    UPDATE reminder_private.deliveries SET email_status='failed',last_error='No registered email is available' WHERE id=q.id; RETURN;
  END IF;
  IF q.email_payload IS NOT NULL AND q.email_payload->'to' IS DISTINCT FROM jsonb_build_array(v_email) THEN
    UPDATE reminder_private.deliveries SET email_status='cancelled',last_error='Registered email changed after the first attempt' WHERE id=q.id; RETURN;
  END IF;
  IF q.email_payload IS NULL THEN
    SELECT COALESCE(NULLIF(value,''),'Drivevell') INTO v_name FROM public.site_settings WHERE key='site_name';
    v_name:=COALESCE(v_name,'Drivevell');
    SELECT value INTO v_support FROM public.site_settings WHERE key='admin_contact_email';
    v_subject:=v_name||CASE WHEN q.milestone=0 THEN ': update your expired platform evidence' ELSE ': your platform evidence expires soon' END;
    v_text:=v_name||E' document reminder\n\n'||q.label||' expires on '||to_char(q.expires_at AT TIME ZONE 'Africa/Nairobi','DD Mon YYYY HH24:MI')||E' EAT.\n\n'||
      CASE WHEN q.milestone=0 THEN 'Your evidence has expired. Please upload and submit updated proof now.' ELSE 'Prepare your latest proof. Renewal unlocks when the current approval expires; submit your update promptly then.' END||
      E'\n\nKeep your documents up to date to avoid your listing being made private or removed by an administrator. Uploading a draft alone does not submit it for review. If your renewal is already pending, wait for the review decision.'||
      E'\n\nOpen your account: '||rtrim(cfg.site_url,'/')||q.path||E'\nSupport: '||COALESCE(v_support,rtrim(cfg.site_url,'/')||'/contact')||
      E'\n\nThis is an account-service reminder, not a marketing email. Do not send identity documents by email.';
    q.email_payload:=jsonb_build_object('from',regexp_replace(v_name,'[<>"\r\n]','','g')||' <'||cfg.from_email||'>','to',jsonb_build_array(v_email),'subject',v_subject,'text',v_text);
    IF NULLIF(v_support,'') IS NOT NULL THEN q.email_payload:=q.email_payload||jsonb_build_object('reply_to',v_support); END IF;
  END IF;
  SELECT net.http_post(url:='https://api.resend.com/emails',body:=q.email_payload,
    headers:=jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json','Idempotency-Key','document-reminder/'||q.id::text),timeout_milliseconds:=10000) INTO v_request;
  UPDATE reminder_private.deliveries SET email_status='sending',request_id=v_request,attempts=attempts+1,email_payload=q.email_payload,
    first_attempt_at=COALESCE(first_attempt_at,now()),next_attempt_at=now() WHERE id=q.id;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_document_reminder_email() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.admin_document_email_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN jsonb_build_object('enabled',COALESCE((SELECT enabled AND NULLIF(from_email,'') IS NOT NULL FROM reminder_private.email_config WHERE id),false) AND EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name='document_reminder_resend_key'),
    'queued',(SELECT count(*) FROM reminder_private.deliveries WHERE email_status IN ('queued','sending')),
    'accepted',(SELECT count(*) FROM reminder_private.deliveries WHERE email_status='accepted'),
    'failed',(SELECT count(*) FROM reminder_private.deliveries WHERE email_status='failed'));
END;
$$;

-- Neither job needs a browser or the owner's computer to remain open.
SELECT cron.schedule('document-expiry-reminders','5 * * * *','SELECT public.process_document_expiry_reminders()');
SELECT cron.schedule('document-reminder-email','* * * * *','SELECT public.dispatch_document_reminder_email()');
