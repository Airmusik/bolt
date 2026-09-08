-- Immediate, retryable email alerts for accepted connections and new chat messages.
CREATE TABLE IF NOT EXISTS reminder_private.event_email (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL UNIQUE REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('connection_accepted', 'message')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'accepted', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  request_id bigint,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON reminder_private.event_email FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION reminder_private.event_email_html(
  p_heading text, p_message text, p_button text, p_path text, p_brand text, p_base_url text
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, reminder_private
AS $$
DECLARE safe_brand text; logo text; logo_html text := ''; link text;
BEGIN
  safe_brand := reminder_private.email_html_escape(p_brand);
  SELECT value INTO logo FROM public.site_settings WHERE key = 'site_logo_url';
  link := reminder_private.email_html_escape(rtrim(p_base_url, '/') || p_path);
  IF nullif(logo, '') IS NOT NULL THEN
    logo_html := '<img src="' || reminder_private.email_html_escape(logo) || '" width="44" height="44" alt="' || safe_brand || ' logo" style="display:block;margin:0 auto 10px;border:0;border-radius:8px;object-fit:contain;">';
  END IF;
  RETURN '<!doctype html><html><body style="margin:0;background:#f3f3f3;font-family:Arial,sans-serif;color:#171717;">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px;">'
    || '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e5e5;">'
    || '<tr><td style="height:6px;background:#b9470a;"></td></tr><tr><td align="center" style="padding:26px 28px 8px;">' || logo_html
    || '<div style="font-size:20px;font-weight:700;">' || safe_brand || '</div></td></tr>'
    || '<tr><td style="padding:12px 28px 30px;text-align:center;"><h1 style="margin:0 0 12px;font-size:24px;line-height:31px;">' || reminder_private.email_html_escape(p_heading) || '</h1>'
    || '<p style="margin:0 auto 24px;max-width:440px;color:#525252;font-size:16px;line-height:25px;">' || reminder_private.email_html_escape(p_message) || '</p>'
    || '<a href="' || link || '" style="display:inline-block;background:#171717;color:#fff;text-decoration:none;border-radius:8px;padding:13px 22px;font-weight:700;">' || reminder_private.email_html_escape(p_button) || '</a></td></tr>'
    || '<tr><td style="padding:18px 28px;background:#f7f7f7;border-top:1px solid #e5e5e5;text-align:center;color:#737373;font-size:12px;line-height:18px;">The right driver. The right car. A trusted connection.<br>This automatic alert was sent by ' || safe_brand || '.</td></tr>'
    || '</table></td></tr></table></body></html>';
END;
$$;
REVOKE ALL ON FUNCTION reminder_private.event_email_html(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_event_email(p_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, reminder_private, auth, vault, net
AS $$
DECLARE q reminder_private.event_email%ROWTYPE; r record; api_key text; recipient text;
  sender_address text; site_url text; site_name text; actor_name text; heading text;
  email_message text; button_text text; path text; request bigint;
BEGIN
  FOR r IN
    SELECT queued.id, queued.attempts, queued.first_attempt_at, response.status_code
    FROM reminder_private.event_email queued JOIN net._http_response response ON response.id = queued.request_id
    WHERE queued.status = 'sending' AND (p_id IS NULL OR queued.id = p_id)
  LOOP
    UPDATE reminder_private.event_email SET
      status = CASE WHEN r.status_code BETWEEN 200 AND 299 THEN 'accepted'
        WHEN (r.status_code IS NULL OR r.status_code = 429 OR r.status_code >= 500) AND r.attempts < 5 AND r.first_attempt_at > now() - interval '23 hours' THEN 'queued'
        ELSE 'failed' END,
      next_attempt_at = CASE WHEN r.status_code BETWEEN 200 AND 299 THEN next_attempt_at ELSE now() + make_interval(mins => power(2, r.attempts)::integer) END
    WHERE id = r.id;
  END LOOP;

  UPDATE reminder_private.event_email SET
    status = CASE WHEN attempts < 5 AND first_attempt_at > now() - interval '23 hours' THEN 'queued' ELSE 'failed' END,
    next_attempt_at = now()
  WHERE status = 'sending' AND next_attempt_at < now() - interval '10 minutes' AND (p_id IS NULL OR id = p_id);

  SELECT c.from_email, c.site_url INTO sender_address, site_url FROM reminder_private.email_config c WHERE c.id;
  SELECT COALESCE(NULLIF(value, ''), '11Drive') INTO site_name FROM public.site_settings WHERE key = 'site_name';
  SELECT btrim(decrypted_secret, E' \r\n\t') INTO api_key FROM vault.decrypted_secrets WHERE name = 'document_reminder_resend_key';
  IF nullif(api_key, '') IS NULL OR nullif(sender_address, '') IS NULL THEN RETURN; END IF;

  SELECT * INTO q FROM reminder_private.event_email
  WHERE status = 'queued' AND next_attempt_at <= now() AND (p_id IS NULL OR id = p_id)
  ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT u.email INTO recipient FROM auth.users u WHERE u.id = q.user_id AND u.email_confirmed_at IS NOT NULL;
  IF nullif(recipient, '') IS NULL THEN UPDATE reminder_private.event_email SET status = 'cancelled' WHERE id = q.id; RETURN; END IF;

  IF q.event_type = 'connection_accepted' THEN
    SELECT p.full_name INTO actor_name
    FROM public.notifications n JOIN public.connections c ON c.id = (n.data->>'connection_id')::uuid
      JOIN public.profiles p ON p.id = CASE WHEN c.requester_id = q.user_id THEN c.recipient_id ELSE c.requester_id END
    WHERE n.id = q.notification_id;
    heading := 'Connection accepted';
    email_message := COALESCE(NULLIF(actor_name, ''), 'A member') || ' accepted your connection request. You can now open ' || site_name || ' to view the connection and start chatting.';
    button_text := 'View connection'; path := '/dashboard?tab=connections';
  ELSE
    SELECT p.full_name INTO actor_name FROM public.notifications n LEFT JOIN public.profiles p ON p.id = (n.data->>'sender_id')::uuid WHERE n.id = q.notification_id;
    heading := 'You have a new message';
    email_message := COALESCE(NULLIF(actor_name, ''), 'A member') || ' sent you a new message on ' || site_name || '. Open the conversation to read and reply.';
    button_text := 'Open message'; path := '/chat/' || COALESCE((SELECT data->>'conversation_id' FROM public.notifications WHERE id = q.notification_id), '');
  END IF;

  IF q.payload IS NULL THEN
    q.payload := jsonb_build_object(
      'from', site_name || ' <' || sender_address || '>', 'to', jsonb_build_array(recipient),
      'subject', heading || ' — ' || site_name,
      'text', email_message || E'\n\n' || rtrim(site_url, '/') || path,
      'html', reminder_private.event_email_html(heading, email_message, button_text, path, site_name, site_url)
    );
  ELSIF q.payload->'to' IS DISTINCT FROM jsonb_build_array(recipient) THEN
    UPDATE reminder_private.event_email SET status = 'cancelled' WHERE id = q.id; RETURN;
  END IF;

  SELECT net.http_post(
    url := 'https://api.resend.com/emails', body := q.payload,
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json')
  ) INTO request;
  UPDATE reminder_private.event_email SET status = 'sending', attempts = attempts + 1,
    request_id = request, payload = q.payload, first_attempt_at = COALESCE(first_attempt_at, now()), next_attempt_at = now()
  WHERE id = q.id;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_event_email(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION reminder_private.queue_event_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, reminder_private
AS $$
DECLARE queue_id uuid;
BEGIN
  IF NEW.type IN ('connection_accepted', 'message') THEN
    INSERT INTO reminder_private.event_email(notification_id, user_id, event_type)
    VALUES (NEW.id, NEW.user_id, NEW.type) ON CONFLICT (notification_id) DO NOTHING RETURNING id INTO queue_id;
    IF queue_id IS NOT NULL THEN PERFORM public.dispatch_event_email(queue_id); END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION reminder_private.queue_event_email() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS queue_event_email_on_notification ON public.notifications;
CREATE TRIGGER queue_event_email_on_notification AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION reminder_private.queue_event_email();

-- Include sender identity in future message notifications without exposing message contents in email.
CREATE OR REPLACE FUNCTION public.notify_new_message() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_site_name text;
BEGIN
  SELECT COALESCE(NULLIF(trim(value), ''), '11Drive') INTO v_site_name FROM public.site_settings WHERE key = 'site_name';
  v_site_name := COALESCE(v_site_name, '11Drive');
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT DISTINCT recipient_id, 'message', 'New message on ' || v_site_name,
    'You have a new message on ' || v_site_name,
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id)
  FROM (
    SELECT unnest(ARRAY[c.driver_id, c.owner_id, c.admin_id]) AS recipient_id FROM public.conversations c WHERE c.id = NEW.conversation_id
    UNION SELECT ca.admin_id FROM public.conversation_admins ca WHERE ca.conversation_id = NEW.conversation_id
  ) recipients
  WHERE recipient_id IS NOT NULL AND recipient_id <> NEW.sender_id;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'event-email-delivery') THEN
    PERFORM cron.schedule('event-email-delivery', '* * * * *', 'SELECT public.dispatch_event_email()');
  END IF;
END $$;
