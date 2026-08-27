-- Closing is a moderation action and does not require the admin to join the
-- conversation. Joining remains required when an admin wants to send messages.

CREATE OR REPLACE FUNCTION public.admin_close_conversation_chat(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
  v_reopened_support_session boolean;
  v_has_member_support_request boolean;
  v_resolution_message boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF v_conversation.driver_id IS NULL OR v_conversation.owner_id IS NULL THEN
    RAISE EXCEPTION 'Only a member connection chat can be closed with this action';
  END IF;
  IF v_conversation.closed_at IS NOT NULL THEN RAISE EXCEPTION 'This chat is already closed'; END IF;

  v_reopened_support_session := v_conversation.support_reopened_at IS NOT NULL
    AND v_conversation.support_resolved_at IS NULL;
  SELECT EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.target_type = 'conversation'
      AND r.target_id = p_conversation_id
      AND r.reason = 'Support requested'
  ) INTO v_has_member_support_request;
  v_resolution_message := v_reopened_support_session
    AND v_conversation.support_reopened_from_member_end
    AND v_has_member_support_request;

  IF v_resolution_message THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, type)
    VALUES (
      p_conversation_id,
      auth.uid(),
      'Support marked this matter as resolved. The chat is read-only again, and the complete history remains saved.',
      'system'
    );
  ELSE
    INSERT INTO public.messages (conversation_id, sender_id, content, type)
    VALUES (
      p_conversation_id,
      auth.uid(),
      'An administrator closed this chat. Members can no longer send new messages, and the complete history remains saved.',
      'system'
    );
  END IF;

  UPDATE public.conversations
  SET closed_at = now(),
      closed_by = auth.uid(),
      support_resolved_at = CASE WHEN v_reopened_support_session THEN now() ELSE support_resolved_at END,
      admin_closed_at = now(),
      admin_closed_by = auth.uid()
  WHERE id = p_conversation_id;

  IF v_resolution_message THEN
    UPDATE public.reports
    SET status = 'resolved'
    WHERE target_type = 'conversation'
      AND target_id = p_conversation_id
      AND reason = 'Support requested'
      AND status IN ('open', 'reviewing');
  END IF;

  RETURN CASE WHEN v_resolution_message THEN 'support_resolved' ELSE 'admin_closed' END;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_close_conversation_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_close_conversation_chat(uuid) TO authenticated;
