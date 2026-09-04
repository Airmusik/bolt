BEGIN;
CREATE OR REPLACE FUNCTION public.dispatch_connection_request_email(p_connection_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q reminder_private.connection_email%ROWTYPE; r record; api_key text; recipient text; sender_name text; site_name text; sender_address text; site_url text; request bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('connection-request-email-worker/'||p_connection_id::text,0)) THEN RETURN; END IF;
 FOR r IN SELECT queued.id,queued.attempts,queued.first_attempt_at,h.status_code FROM reminder_private.connection_email queued JOIN net._http_response h ON h.id=queued.request_id WHERE queued.id=p_connection_id AND queued.status='sending' LOOP
  UPDATE reminder_private.connection_email SET status=CASE WHEN r.status_code BETWEEN 200 AND 299 THEN 'accepted' WHEN (r.status_code IS NULL OR r.status_code=429 OR r.status_code>=500) AND r.attempts<5 AND r.first_attempt_at>now()-interval '23 hours' THEN 'queued' ELSE 'failed' END,
   next_attempt_at=now()+make_interval(mins=>power(2,r.attempts)::integer) WHERE id=r.id;
 END LOOP;
 UPDATE reminder_private.connection_email SET status=CASE WHEN attempts<5 AND first_attempt_at>now()-interval '23 hours' THEN 'queued' ELSE 'failed' END,next_attempt_at=now() WHERE id=p_connection_id AND status='sending' AND next_attempt_at<now()-interval '10 minutes';
 SELECT decrypted_secret INTO api_key FROM vault.decrypted_secrets WHERE name='document_reminder_resend_key' LIMIT 1;
 SELECT c.from_email,c.site_url INTO sender_address,site_url FROM reminder_private.email_config c WHERE id;
 IF nullif(api_key,'') IS NULL OR nullif(sender_address,'') IS NULL THEN RETURN; END IF;
 SELECT * INTO q FROM reminder_private.connection_email WHERE id=p_connection_id AND status='queued' AND next_attempt_at<=now() ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM connections WHERE id=q.id AND status='pending') THEN
  UPDATE reminder_private.connection_email SET status='cancelled' WHERE id=q.id; RETURN;
 END IF;
 IF q.first_attempt_at<now()-interval '23 hours' THEN UPDATE reminder_private.connection_email SET status='failed' WHERE id=q.id; RETURN; END IF;
 SELECT email INTO recipient FROM auth.users WHERE id=q.recipient_id AND email_confirmed_at IS NOT NULL;
 IF nullif(recipient,'') IS NULL THEN UPDATE reminder_private.connection_email SET status='cancelled' WHERE id=q.id; RETURN; END IF;
 IF q.payload IS NOT NULL AND q.payload->'to' IS DISTINCT FROM jsonb_build_array(recipient) THEN UPDATE reminder_private.connection_email SET status='cancelled' WHERE id=q.id; RETURN; END IF;
 IF q.payload IS NULL THEN
  SELECT full_name INTO sender_name FROM profiles WHERE id=q.requester_id;
  SELECT value INTO site_name FROM site_settings WHERE key='site_name';
  site_name:=coalesce(nullif(site_name,''),'11Drive');
  q.payload:=jsonb_build_object('from',regexp_replace(site_name,'[<>"\r\n]','','g')||' <'||sender_address||'>','to',jsonb_build_array(recipient),
   'subject',site_name||': new connection request',
   'text',coalesce(nullif(sender_name,''),'A member')||' sent you a connection request on '||site_name||E'.\n\nSign in to view the request and their profile:\n'||rtrim(site_url,'/')||E'/dashboard?tab=connections\n\nYou can accept or decline the request on the site. This email does not accept the request for you.\n\nThis is an account notification, not a marketing email.');
 END IF;
 SELECT net.http_post(url:='https://api.resend.com/emails',body:=q.payload,headers:=jsonb_build_object('Authorization','Bearer '||api_key,'Content-Type','application/json','Idempotency-Key','connection-request/'||q.id::text),timeout_milliseconds:=10000) INTO request;
 UPDATE reminder_private.connection_email SET status='sending',attempts=attempts+1,request_id=request,payload=q.payload,first_attempt_at=coalesce(first_attempt_at,now()),next_attempt_at=now() WHERE id=q.id;
END $$;

REVOKE ALL ON FUNCTION public.dispatch_connection_request_email(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.queue_connection_request_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='pending' THEN
  INSERT INTO reminder_private.connection_email(id,recipient_id,requester_id) VALUES(NEW.id,NEW.recipient_id,NEW.requester_id) ON CONFLICT DO NOTHING;
  -- Network I/O runs asynchronously after commit. Keep the cron retry fallback.
  BEGIN
   PERFORM public.dispatch_connection_request_email(NEW.id);
  EXCEPTION WHEN OTHERS THEN
   RAISE WARNING 'Immediate connection email dispatch failed; queued for retry';
  END;
 END IF;
 RETURN NEW;
END $$;
COMMIT;

