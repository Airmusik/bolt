-- Allow an explicit email request after an in-app-only reminder, without
-- duplicating the notification or retrying a potentially delivered email.
BEGIN;
DO $migration$
DECLARE definition text;
 old_branch text := 'IF delivery IS NULL THEN RETURN ''A reminder already exists for this expiry milestone. No duplicate was sent.''; END IF;';
 new_branch text := $branch$
 IF delivery IS NULL THEN
  IF p_email THEN
   UPDATE reminder_private.deliveries
   SET email_status='queued',next_attempt_at=now(),last_error=NULL,label=d.label,path=d.path
   WHERE source_key=d.source_key AND expires_at=d.expires_at AND milestone=v_milestone
     AND email_status='cancelled' AND attempts=0 AND request_id IS NULL AND first_attempt_at IS NULL
   RETURNING id INTO delivery;
   IF delivery IS NOT NULL THEN RETURN 'In-app reminder already exists; email queued for delivery. No duplicate notification was sent.'; END IF;
   IF EXISTS(SELECT 1 FROM reminder_private.deliveries WHERE source_key=d.source_key AND expires_at=d.expires_at AND milestone=v_milestone AND email_status IN ('queued','sending','accepted')) THEN
    RETURN 'In-app reminder already exists; email is already queued or accepted by the provider. No duplicate was sent.';
   END IF;
   RAISE EXCEPTION 'In-app reminder exists, but email needs review before retrying. Check email delivery status to avoid duplicate mail.';
  END IF;
  RETURN 'A reminder already exists for this expiry milestone. No duplicate was sent.';
 END IF;
 $branch$;
BEGIN
 SELECT pg_get_functiondef('public.admin_send_document_reminder(text,boolean)'::regprocedure) INTO definition;
 IF position(old_branch IN definition)=0 THEN RAISE EXCEPTION 'Unexpected reminder function version'; END IF;
 EXECUTE replace(definition,old_branch,new_branch);
END $migration$;
COMMIT;
