CREATE OR REPLACE FUNCTION public.get_conversation_block_status(
  p_conversation_id uuid
)
RETURNS TABLE (
  i_blocked_other boolean,
  blocked_by_other boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
  v_other_id uuid;
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

  IF auth.uid() = v_conversation.driver_id THEN
    v_other_id := v_conversation.owner_id;
  ELSIF auth.uid() = v_conversation.owner_id THEN
    v_other_id := v_conversation.driver_id;
  ELSE
    RAISE EXCEPTION 'Only conversation members can view block status';
  END IF;

  RETURN QUERY SELECT
    EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.blocker_id = auth.uid() AND b.blocked_id = v_other_id
    ),
    EXISTS (
      SELECT 1 FROM public.blocks b
      WHERE b.blocker_id = v_other_id AND b.blocked_id = auth.uid()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_block_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversation_block_status(uuid) TO authenticated;

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
  v_joined_admin boolean := false;
  v_direct_participant boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id;
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

  IF v_conversation.closed_at IS NOT NULL AND NOT v_joined_admin THEN
    RAISE EXCEPTION 'This connection has ended. The chat is read-only; send and accept a new connection request to chat again.';
  END IF;

  IF auth.uid() IN (v_conversation.driver_id, v_conversation.owner_id)
     AND EXISTS (
       SELECT 1 FROM public.blocks b
       WHERE b.blocker_id = auth.uid()
         AND b.blocked_id = CASE
           WHEN auth.uid() = v_conversation.driver_id THEN v_conversation.owner_id
           ELSE v_conversation.driver_id
         END
     )
  THEN
    RAISE EXCEPTION 'You blocked this member. Unblock them before sending a message.';
  END IF;

  IF auth.uid() IN (v_conversation.driver_id, v_conversation.owner_id)
     AND EXISTS (
       SELECT 1 FROM public.blocks b
       WHERE b.blocked_id = auth.uid()
         AND b.blocker_id = CASE
           WHEN auth.uid() = v_conversation.driver_id THEN v_conversation.owner_id
           ELSE v_conversation.driver_id
         END
     )
  THEN
    RAISE EXCEPTION 'This member has blocked messaging with you.';
  END IF;

  IF length(trim(COALESCE(p_content, ''))) = 0 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  IF length(trim(p_content)) > 1000 THEN RAISE EXCEPTION 'Message must be 1000 characters or fewer'; END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, type)
  VALUES (p_conversation_id, auth.uid(), trim(p_content), 'text')
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;
