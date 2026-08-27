-- Admins may close any open member chat. The support-resolution message is
-- reserved for chats that were previously ended and reopened for a member's
-- explicit support request.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS admin_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_reopened_from_member_end boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_join_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
  v_inserted integer;
  v_was_closed boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  v_was_closed := v_conversation.closed_at IS NOT NULL;
  INSERT INTO public.conversation_admins (conversation_id, admin_id)
  VALUES (p_conversation_id, auth.uid())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_was_closed THEN
    UPDATE public.conversations
    SET closed_at = NULL,
        closed_by = NULL,
        support_reopened_at = now(),
        support_reopened_by = auth.uid(),
        support_resolved_at = NULL,
        support_reopened_from_member_end = (
          v_conversation.admin_closed_at IS NULL
          AND v_conversation.closed_by IN (v_conversation.driver_id, v_conversation.owner_id)
        ),
        admin_closed_at = NULL,
        admin_closed_by = NULL
    WHERE id = p_conversation_id;

    INSERT INTO public.messages (conversation_id, sender_id, content, type)
    VALUES (
      p_conversation_id,
      auth.uid(),
      'Support reopened this ended chat. Both members can message again while the support session is active.',
      'system'
    );
  ELSIF v_inserted > 0 THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, type)
    VALUES (
      p_conversation_id,
      auth.uid(),
      'An administrator joined this conversation to provide support and help resolve concerns.',
      'system'
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_join_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_join_conversation(uuid) TO authenticated;

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
  IF auth.uid() <> v_conversation.admin_id
     AND NOT EXISTS (
       SELECT 1 FROM public.conversation_admins ca
       WHERE ca.conversation_id = p_conversation_id AND ca.admin_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Join this conversation before closing it';
  END IF;

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

-- Preserve the previous RPC name for already-loaded browser sessions while
-- routing it through the stricter close logic above.
CREATE OR REPLACE FUNCTION public.admin_resolve_conversation_support(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.admin_close_conversation_chat(p_conversation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_conversation_support(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_conversation_support(uuid) TO authenticated;
