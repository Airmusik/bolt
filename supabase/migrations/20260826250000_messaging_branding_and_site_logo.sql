-- Reliable message delivery with useful errors, live-branded notifications,
-- and a public bucket for the administrator-managed site logo.

CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_content text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages%ROWTYPE;
  v_conversation public.conversations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_conversation.closed_at IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.conversation_admins ca
       WHERE ca.conversation_id = p_conversation_id AND ca.admin_id = auth.uid()
     )
  THEN
    RAISE EXCEPTION 'This connection has ended. The chat is read-only; send and accept a new connection request to chat again.';
  END IF;

  IF NOT public.can_send_to_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'You do not have permission to send messages in this conversation';
  END IF;

  IF length(trim(COALESCE(p_content, ''))) = 0 THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  IF length(trim(p_content)) > 1000 THEN
    RAISE EXCEPTION 'Message must be 1000 characters or fewer';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, type)
  VALUES (p_conversation_id, auth.uid(), trim(p_content), 'text')
  RETURNING * INTO v_message;

  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_site_name text;
BEGIN
  SELECT COALESCE(NULLIF(trim(value), ''), 'GariLink')
  INTO v_site_name
  FROM public.site_settings
  WHERE key = 'site_name';
  v_site_name := COALESCE(v_site_name, 'GariLink');

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

INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('site_logo_url', '', now())
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('site-assets', 'site-assets', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "site_assets_public_read" ON storage.objects;
CREATE POLICY "site_assets_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'site-assets');

DROP POLICY IF EXISTS "site_assets_admin_insert" ON storage.objects;
CREATE POLICY "site_assets_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-assets' AND public.is_admin());

DROP POLICY IF EXISTS "site_assets_admin_update" ON storage.objects;
CREATE POLICY "site_assets_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'site-assets' AND public.is_admin())
  WITH CHECK (bucket_id = 'site-assets' AND public.is_admin());

DROP POLICY IF EXISTS "site_assets_admin_delete" ON storage.objects;
CREATE POLICY "site_assets_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'site-assets' AND public.is_admin());
