-- Keep member support in one conversation and deliver guest support email in both directions.
CREATE OR REPLACE FUNCTION public.send_member_support_message(p_message text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_thread_id uuid;
  v_message text := trim(COALESCE(p_message, ''));
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Sign in to send a member support message'; END IF;
  IF char_length(v_message) < 5 OR char_length(v_message) > 5000 THEN
    RAISE EXCEPTION 'Support message must be between 5 and 5000 characters';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member profile not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 71411));

  SELECT id INTO v_thread_id
  FROM public.contact_messages
  WHERE user_id = v_user_id
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.contact_messages (user_id, name, email, message, status)
    VALUES (
      v_user_id,
      COALESCE(NULLIF(trim(v_profile.full_name), ''), 'Registered member'),
      COALESCE(NULLIF(trim(v_profile.email), ''), (SELECT email FROM auth.users WHERE id = v_user_id)),
      v_message,
      'new'
    ) RETURNING id INTO v_thread_id;
  ELSE
    INSERT INTO public.contact_message_entries (contact_message_id, sender_id, sender_role, body)
    VALUES (v_thread_id, v_user_id, 'user', v_message);
  END IF;

  RETURN v_thread_id;
END;
$$;
REVOKE ALL ON FUNCTION public.send_member_support_message(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_member_support_message(text) TO authenticated;

CREATE TABLE IF NOT EXISTS reminder_private.support_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_entry_id uuid NOT NULL UNIQUE REFERENCES public.contact_message_entries(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('guest_to_admin', 'admin_to_guest')),
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'accepted', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  request_id bigint,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON reminder_private.support_email FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_support_email(p_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, reminder_private, vault, net
AS $$
DECLARE
  q reminder_private.support_email%ROWTYPE;
  r record;
  api_key text;
  request bigint;
BEGIN
  FOR r IN
    SELECT queued.id, queued.attempts, queued.first_attempt_at, response.status_code
    FROM reminder_private.support_email queued
    JOIN net._http_response response ON response.id = queued.request_id
    WHERE queued.status = 'sending' AND (p_id IS NULL OR queued.id = p_id)
  LOOP
    UPDATE reminder_private.support_email SET
      status = CASE
        WHEN r.status_code BETWEEN 200 AND 299 THEN 'accepted'
        WHEN (r.status_code IS NULL OR r.status_code = 429 OR r.status_code >= 500)
          AND r.attempts < 5 AND r.first_attempt_at > now() - interval '23 hours' THEN 'queued'
        ELSE 'failed' END,
      next_attempt_at = CASE WHEN r.status_code BETWEEN 200 AND 299 THEN next_attempt_at
        ELSE now() + make_interval(mins => power(2, r.attempts)::integer) END
    WHERE id = r.id;
  END LOOP;

  UPDATE reminder_private.support_email SET
    status = CASE WHEN attempts < 5 AND first_attempt_at > now() - interval '23 hours' THEN 'queued' ELSE 'failed' END,
    next_attempt_at = now()
  WHERE status = 'sending' AND next_attempt_at < now() - interval '10 minutes'
    AND (p_id IS NULL OR id = p_id);

  SELECT btrim(decrypted_secret, E' \r\n\t') INTO api_key
  FROM vault.decrypted_secrets WHERE name = 'document_reminder_resend_key';
  IF NULLIF(api_key, '') IS NULL THEN RETURN; END IF;

  SELECT * INTO q FROM reminder_private.support_email
  WHERE status = 'queued' AND next_attempt_at <= now() AND (p_id IS NULL OR id = p_id)
  ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT net.http_post(
    url := 'https://api.resend.com/emails',
    body := q.payload,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type', 'application/json',
      'Idempotency-Key', 'support-email/' || q.id::text
    )
  ) INTO request;

  UPDATE reminder_private.support_email SET status = 'sending', attempts = attempts + 1,
    request_id = request, first_attempt_at = COALESCE(first_attempt_at, now()), next_attempt_at = now()
  WHERE id = q.id;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_support_email(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION reminder_private.queue_support_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, reminder_private
AS $$
DECLARE
  thread public.contact_messages%ROWTYPE;
  sender_address text;
  support_address text;
  site_url text;
  site_name text;
  recipient text;
  heading text;
  summary text;
  button_text text;
  path text;
  direction text;
  email_payload jsonb;
  queue_id uuid;
BEGIN
  SELECT * INTO thread FROM public.contact_messages WHERE id = NEW.contact_message_id;
  IF NOT FOUND OR thread.user_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT from_email, c.site_url INTO sender_address, site_url
  FROM reminder_private.email_config c WHERE c.id;
  SELECT COALESCE(NULLIF(value, ''), '11Drive') INTO site_name FROM public.site_settings WHERE key = 'site_name';
  SELECT NULLIF(value, '') INTO support_address FROM public.site_settings WHERE key = 'admin_contact_email';
  site_name := COALESCE(site_name, '11Drive');

  IF NEW.sender_role = 'guest' THEN
    recipient := support_address;
    direction := 'guest_to_admin';
    heading := 'New website support message';
    summary := COALESCE(NULLIF(thread.name, ''), 'A guest') || ' (' || thread.email || ') wrote: ' || COALESCE(NULLIF(NEW.body, ''), 'Attachment received.');
    button_text := 'Open in Messages';
    path := '/admin?tab=contact&message=' || thread.id::text;
  ELSIF NEW.sender_role = 'admin' THEN
    recipient := thread.email;
    direction := 'admin_to_guest';
    heading := 'Support replied to your message';
    summary := COALESCE(NULLIF(NEW.body, ''), 'Support sent you an attachment.');
    button_text := 'Contact support';
    path := '/contact';
  ELSE
    RETURN NEW;
  END IF;

  IF NULLIF(recipient, '') IS NULL OR NULLIF(sender_address, '') IS NULL THEN RETURN NEW; END IF;
  email_payload := jsonb_build_object(
    'from', site_name || ' <' || sender_address || '>',
    'to', jsonb_build_array(recipient),
    'reply_to', CASE WHEN direction = 'guest_to_admin' THEN thread.email ELSE support_address END,
    'subject', heading || ' — ' || site_name,
    'text', summary || E'\n\n' || rtrim(site_url, '/') || path,
    'html', reminder_private.event_email_html(heading, summary, button_text, path, site_name, site_url)
  );

  INSERT INTO reminder_private.support_email (contact_entry_id, direction, recipient_email, payload)
  VALUES (NEW.id, direction, recipient, email_payload)
  ON CONFLICT (contact_entry_id) DO NOTHING RETURNING id INTO queue_id;
  IF queue_id IS NOT NULL THEN PERFORM public.dispatch_support_email(queue_id); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION reminder_private.queue_support_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS queue_support_email_on_contact_entry ON public.contact_message_entries;
CREATE TRIGGER queue_support_email_on_contact_entry
AFTER INSERT ON public.contact_message_entries
FOR EACH ROW EXECUTE FUNCTION reminder_private.queue_support_email();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'support-email-delivery') THEN
    PERFORM cron.schedule('support-email-delivery', '* * * * *', 'SELECT public.dispatch_support_email()');
  END IF;
END $$;
