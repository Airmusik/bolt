-- Chat images are private evidence shared only with conversation participants and joined support admins.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', false, 8388608, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "chat_media_read_participants" ON storage.objects;
CREATE POLICY "chat_media_read_participants" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = CASE
        WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END
      AND (
        auth.uid() IN (c.driver_id, c.owner_id, c.admin_id)
        OR EXISTS (
          SELECT 1 FROM public.conversation_admins ca
          WHERE ca.conversation_id = c.id AND ca.admin_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "chat_media_upload_participants" ON storage.objects;
CREATE POLICY "chat_media_upload_participants" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN public.can_send_to_conversation(((storage.foldername(name))[1])::uuid)
      ELSE false
    END
  );

DROP POLICY IF EXISTS "chat_media_delete_own" ON storage.objects;
CREATE POLICY "chat_media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE OR REPLACE FUNCTION public.send_chat_image(
  p_conversation_id uuid,
  p_path text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages%ROWTYPE;
  v_conversation public.conversations%ROWTYPE;
  v_joined_admin boolean := false;
  v_direct_participant boolean := false;
  v_expected_prefix text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_conversation FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  v_direct_participant := auth.uid() = v_conversation.driver_id
    OR auth.uid() = v_conversation.owner_id
    OR auth.uid() = v_conversation.admin_id;
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_admins ca
    WHERE ca.conversation_id = p_conversation_id AND ca.admin_id = auth.uid()
  ) INTO v_joined_admin;

  IF NOT v_direct_participant AND NOT v_joined_admin THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;
  IF v_conversation.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This chat is read-only. An administrator can reopen it when support is needed.';
  END IF;

  IF auth.uid() IN (v_conversation.driver_id, v_conversation.owner_id)
     AND v_conversation.driver_id IS NOT NULL
     AND v_conversation.owner_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.blocks b
       WHERE (b.blocker_id = v_conversation.driver_id AND b.blocked_id = v_conversation.owner_id)
          OR (b.blocker_id = v_conversation.owner_id AND b.blocked_id = v_conversation.driver_id)
     ) THEN
    RAISE EXCEPTION 'Messaging is unavailable because one member blocked the other';
  END IF;

  v_expected_prefix := p_conversation_id::text || '/' || auth.uid()::text || '/';
  IF p_path IS NULL
     OR length(p_path) > 500
     OR position('..' IN p_path) > 0
     OR left(p_path, length(v_expected_prefix)) <> v_expected_prefix
     OR right(lower(p_path), 4) <> '.jpg' THEN
    RAISE EXCEPTION 'Invalid chat image path';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'chat-media' AND name = p_path AND owner_id = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Chat image upload was not found';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, type)
  VALUES (p_conversation_id, auth.uid(), p_path, 'image')
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_image(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_chat_image(uuid, text) TO authenticated;
