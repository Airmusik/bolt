-- Admin-authored service updates delivered in-app, optionally by email too.
ALTER TABLE reminder_private.event_email DROP CONSTRAINT IF EXISTS event_email_event_type_check;
ALTER TABLE reminder_private.event_email ADD CONSTRAINT event_email_event_type_check
  CHECK (event_type IN ('connection_accepted', 'message', 'admin_announcement'));

CREATE TABLE IF NOT EXISTS reminder_private.member_update_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  audience text NOT NULL CHECK (audience IN ('all', 'driver', 'owner')),
  title text NOT NULL,
  body text NOT NULL,
  email_enabled boolean NOT NULL,
  recipient_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON reminder_private.member_update_audit FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION reminder_private.queue_event_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, reminder_private, auth
AS $$
DECLARE queue_id uuid; recipient text; sender_address text; site_url text; site_name text; email_payload jsonb;
BEGIN
  IF NEW.type IN ('connection_accepted', 'message') THEN
    INSERT INTO reminder_private.event_email(notification_id, user_id, event_type)
    VALUES (NEW.id, NEW.user_id, NEW.type) ON CONFLICT (notification_id) DO NOTHING RETURNING id INTO queue_id;
  ELSIF NEW.type = 'admin_announcement' AND COALESCE((NEW.data->>'email')::boolean, false) THEN
    SELECT u.email INTO recipient FROM auth.users u WHERE u.id = NEW.user_id AND u.email_confirmed_at IS NOT NULL;
    SELECT c.from_email, c.site_url INTO sender_address, site_url FROM reminder_private.email_config c WHERE c.id;
    SELECT COALESCE(NULLIF(value, ''), '11Drive') INTO site_name FROM public.site_settings WHERE key = 'site_name';
    IF nullif(recipient, '') IS NOT NULL AND nullif(sender_address, '') IS NOT NULL THEN
      email_payload := jsonb_build_object(
        'from', site_name || ' <' || sender_address || '>', 'to', jsonb_build_array(recipient),
        'subject', NEW.title || ' — ' || site_name,
        'text', NEW.body || E'\n\n' || rtrim(site_url, '/') || '/notifications',
        'html', reminder_private.event_email_html(NEW.title, NEW.body, 'View update', '/notifications', site_name, site_url)
      );
      INSERT INTO reminder_private.event_email(notification_id, user_id, event_type, payload)
      VALUES (NEW.id, NEW.user_id, NEW.type, email_payload) ON CONFLICT (notification_id) DO NOTHING RETURNING id INTO queue_id;
    END IF;
  END IF;
  IF queue_id IS NOT NULL THEN PERFORM public.dispatch_event_email(queue_id); END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION reminder_private.queue_event_email() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_send_member_update(
  p_audience text, p_title text, p_body text, p_email boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, reminder_private
AS $$
DECLARE update_id uuid := gen_random_uuid(); sent_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  p_audience := lower(trim(COALESCE(p_audience, '')));
  p_title := trim(COALESCE(p_title, ''));
  p_body := trim(COALESCE(p_body, ''));
  IF p_audience NOT IN ('all', 'driver', 'owner') THEN RAISE EXCEPTION 'Choose a valid audience'; END IF;
  IF length(p_title) < 3 OR length(p_title) > 80 THEN RAISE EXCEPTION 'Title must be between 3 and 80 characters'; END IF;
  IF length(p_body) < 5 OR length(p_body) > 1000 THEN RAISE EXCEPTION 'Message must be between 5 and 1000 characters'; END IF;

  INSERT INTO public.notifications(user_id, type, title, body, data)
  SELECT p.id, 'admin_announcement', p_title, p_body,
    jsonb_build_object('path', '/notifications', 'email', p_email, 'update_id', update_id)
  FROM public.profiles p
  WHERE p.role IN ('driver', 'owner') AND NOT COALESCE(p.is_suspended, false)
    AND (p_audience = 'all' OR p.role = p_audience);
  GET DIAGNOSTICS sent_count = ROW_COUNT;

  INSERT INTO reminder_private.member_update_audit(id, admin_id, audience, title, body, email_enabled, recipient_count)
  VALUES(update_id, auth.uid(), p_audience, p_title, p_body, p_email, sent_count);
  RETURN sent_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_send_member_update(text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_send_member_update(text,text,text,boolean) TO authenticated;
