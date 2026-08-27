-- Admin support sessions can temporarily reopen an ended member conversation.
-- The underlying connection remains ended; only the preserved chat is reopened.

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS support_reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS support_reopened_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_resolved_at timestamptz;

CREATE OR REPLACE FUNCTION public.can_send_to_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND c.closed_at IS NULL
      AND (
        auth.uid() IN (c.driver_id, c.owner_id, c.admin_id)
        OR EXISTS (
          SELECT 1 FROM public.conversation_admins ca
          WHERE ca.conversation_id = c.id AND ca.admin_id = auth.uid()
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = auth.uid() AND b.blocked_id IN (c.driver_id, c.owner_id, c.admin_id))
           OR (b.blocked_id = auth.uid() AND b.blocker_id IN (c.driver_id, c.owner_id, c.admin_id))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_send_to_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_to_conversation(uuid) TO authenticated;

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
        support_resolved_at = NULL
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

CREATE OR REPLACE FUNCTION public.admin_resolve_conversation_support(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF v_conversation.support_reopened_at IS NULL
     OR v_conversation.support_resolved_at IS NOT NULL
     OR v_conversation.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'There is no active reopened support session for this chat';
  END IF;
  IF auth.uid() <> v_conversation.admin_id
     AND NOT EXISTS (
       SELECT 1 FROM public.conversation_admins ca
       WHERE ca.conversation_id = p_conversation_id AND ca.admin_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Join this conversation before resolving its support session';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, type)
  VALUES (
    p_conversation_id,
    auth.uid(),
    'Support marked this matter as resolved. The chat is read-only again, and the complete history remains saved.',
    'system'
  );

  UPDATE public.conversations
  SET closed_at = now(),
      closed_by = auth.uid(),
      support_resolved_at = now()
  WHERE id = p_conversation_id;

  UPDATE public.reports
  SET status = 'resolved'
  WHERE target_type = 'conversation'
    AND target_id = p_conversation_id
    AND reason = 'Support requested'
    AND status IN ('open', 'reviewing');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_resolve_conversation_support(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_resolve_conversation_support(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_conversation_support(
  p_conversation_id uuid,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
  v_other_id uuid;
  v_report_id uuid;
  v_requester_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF length(trim(COALESCE(p_message, ''))) < 10 THEN
    RAISE EXCEPTION 'Tell support what help you need using at least 10 characters';
  END IF;
  IF length(trim(p_message)) > 1000 THEN RAISE EXCEPTION 'Support request must be 1000 characters or fewer'; END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF v_conversation.driver_id IS NULL OR v_conversation.owner_id IS NULL
     OR auth.uid() NOT IN (v_conversation.driver_id, v_conversation.owner_id) THEN
    RAISE EXCEPTION 'Only a member of this connection chat can request support';
  END IF;

  v_other_id := CASE
    WHEN auth.uid() = v_conversation.driver_id THEN v_conversation.owner_id
    ELSE v_conversation.driver_id
  END;

  SELECT id INTO v_report_id
  FROM public.reports
  WHERE reporter_id = auth.uid()
    AND target_type = 'conversation'
    AND target_id = p_conversation_id
    AND reason = 'Support requested'
    AND status IN ('open', 'reviewing')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_report_id IS NOT NULL THEN RETURN v_report_id; END IF;

  INSERT INTO public.reports (reporter_id, reported_id, target_type, target_id, reason, description)
  VALUES (auth.uid(), v_other_id, 'conversation', p_conversation_id, 'Support requested', trim(p_message))
  RETURNING id INTO v_report_id;

  SELECT full_name INTO v_requester_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT p.id,
         'support_request',
         'Support requested for a connection chat',
         COALESCE(v_requester_name, 'A member') || ' asked for help with a specific conversation.',
         jsonb_build_object(
           'path', '/admin?tab=reports',
           'conversation_id', p_conversation_id,
           'report_id', v_report_id
         )
  FROM public.profiles p
  WHERE p.role = 'admin' AND NOT p.is_suspended;

  RETURN v_report_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_conversation_support(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_conversation_support(uuid, text) TO authenticated;

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
     AND EXISTS (
       SELECT 1 FROM public.blocks b
       WHERE b.blocker_id = auth.uid()
         AND b.blocked_id = CASE WHEN auth.uid() = v_conversation.driver_id THEN v_conversation.owner_id ELSE v_conversation.driver_id END
     ) THEN
    RAISE EXCEPTION 'You blocked this member. Unblock them before sending a message.';
  END IF;

  IF auth.uid() IN (v_conversation.driver_id, v_conversation.owner_id)
     AND EXISTS (
       SELECT 1 FROM public.blocks b
       WHERE b.blocked_id = auth.uid()
         AND b.blocker_id = CASE WHEN auth.uid() = v_conversation.driver_id THEN v_conversation.owner_id ELSE v_conversation.driver_id END
     ) THEN
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
