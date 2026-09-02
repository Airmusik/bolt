-- Keep generated notifications tied to the administrator's current site name.
-- CREATE OR REPLACE preserves the existing trigger bindings and function grants.
CREATE OR REPLACE FUNCTION public.notify_new_connection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_site_name text;
BEGIN
  SELECT NULLIF(trim(value), '') INTO v_site_name
  FROM public.site_settings WHERE key = 'site_name';
  v_site_name := COALESCE(v_site_name, '11Drive');

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.recipient_id, 'connection_request', 'New connection request',
    'You have a new connection request on ' || v_site_name || '.',
    jsonb_build_object('connection_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_site_name text;
BEGIN
  SELECT NULLIF(trim(value), '') INTO v_site_name
  FROM public.site_settings WHERE key = 'site_name';
  v_site_name := COALESCE(v_site_name, '11Drive');

  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT DISTINCT recipient_id, 'message', 'New message on ' || v_site_name,
    'You have a new message on ' || v_site_name,
    jsonb_build_object('conversation_id', NEW.conversation_id)
  FROM (
    SELECT unnest(ARRAY[c.driver_id, c.owner_id, c.admin_id]) AS recipient_id
    FROM public.conversations c WHERE c.id = NEW.conversation_id
    UNION
    SELECT ca.admin_id FROM public.conversation_admins ca WHERE ca.conversation_id = NEW.conversation_id
  ) recipients
  WHERE recipient_id IS NOT NULL AND recipient_id <> NEW.sender_id;
  RETURN NEW;
END;
$$;

-- Only known, generated notification templates are eligible. Never replace text
-- in personal messages, report descriptions, warnings, or legal acceptance records.
-- No notification is inserted/deleted; IDs, timestamps, read flags and links stay intact.
DO $$
DECLARE v_site_name text;
BEGIN
  SELECT NULLIF(trim(value), '') INTO v_site_name
  FROM public.site_settings WHERE key = 'site_name';
  v_site_name := COALESCE(v_site_name, '11Drive');

  UPDATE public.notifications
  SET title = 'New message on ' || v_site_name,
      body = 'You have a new message on ' || v_site_name
  WHERE type = 'message'
    AND title ~* '^New message( on (Drivevell|GariLink))?$'
    AND body ~* '^You have a new message on (Drivevell|GariLink)[.]?$';

  UPDATE public.notifications
  SET body = 'You have a new connection request on ' || v_site_name || '.'
  WHERE type = 'connection_request' AND title = 'New connection request'
    AND body ~* '^You have a new connection request on (Drivevell|GariLink)[.]?$';

  UPDATE public.notifications
  SET body = left(body, length(body) - length(substring(body from '(?i)(?:Drivevell|GariLink)[.]$')))
    || v_site_name || '.'
  WHERE type = 'trust'
    AND (
      (title = 'Platform history approved' AND body ~* '^Your recent (uber|bolt|faras|little|little cab|other) history is now approved on (Drivevell|GariLink)[.]$')
      OR (title = 'Trust Passport approved' AND body ~* '^Your Trust Passport is now approved on (Drivevell|GariLink)[.]$')
    );
END;
$$;
