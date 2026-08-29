-- Account lifecycle, report resolution, and joined-chat membership controls.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to delete your account';
  END IF;

  IF public.is_admin() THEN
    RAISE EXCEPTION 'Administrator accounts must be transferred or removed by another administrator';
  END IF;

  -- profiles.id references auth.users(id) ON DELETE CASCADE. The related
  -- listings, applications, conversations, messages, reports and uploads are
  -- also linked with cascading foreign keys.
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_leave_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_conversation.admin_id = auth.uid() THEN
    RAISE EXCEPTION 'The assigned administrator cannot leave a direct support chat';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_admins
    WHERE conversation_id = p_conversation_id AND admin_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You have not joined this conversation';
  END IF;

  IF v_conversation.support_reopened_at IS NOT NULL
     AND v_conversation.support_resolved_at IS NULL
     AND v_conversation.closed_at IS NULL THEN
    RAISE EXCEPTION 'End the support session before leaving this conversation';
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, type, read)
  VALUES (p_conversation_id, auth.uid(), 'An administrator left this conversation.', 'system', false);

  DELETE FROM public.conversation_admins
  WHERE conversation_id = p_conversation_id AND admin_id = auth.uid();

  UPDATE public.conversations
  SET last_message_at = now()
  WHERE id = p_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_leave_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_leave_conversation(uuid) TO authenticated;

-- Sending a warning is a completed moderation action. Keep the warning and
-- report details linked, notify the member, and move the case out of the
-- unresolved counter immediately.
CREATE OR REPLACE FUNCTION public.admin_issue_report_warning(p_report_id uuid, p_message text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports%ROWTYPE;
  v_warning_count integer;
  v_body text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF char_length(trim(COALESCE(p_message, ''))) < 3 THEN RAISE EXCEPTION 'A warning message is required'; END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.reported_id IS NULL THEN RAISE EXCEPTION 'This report has no reported user'; END IF;

  INSERT INTO public.user_warnings (user_id, report_id, admin_id, message, report_reason, report_description)
  VALUES (v_report.reported_id, v_report.id, auth.uid(), trim(p_message), v_report.reason, v_report.description);

  SELECT count(*)::integer INTO v_warning_count
  FROM public.user_warnings
  WHERE user_id = v_report.reported_id;

  v_body := 'Report: ' || v_report.reason || '. ' ||
    CASE WHEN nullif(trim(COALESCE(v_report.description, '')), '') IS NOT NULL
      THEN 'Details: ' || trim(v_report.description) || '. ' ELSE '' END ||
    'Admin message: ' || trim(p_message) || '. This is warning ' || v_warning_count ||
    '. Three warnings may lead to account suspension.';

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_report.reported_id, 'warning', 'Account warning related to a report', v_body,
    jsonb_build_object(
      'report_id', v_report.id,
      'report_reason', v_report.reason,
      'target_type', v_report.target_type,
      'warning_count', v_warning_count
    )
  );

  UPDATE public.reports SET status = 'resolved' WHERE id = v_report.id;
  RETURN v_warning_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_issue_report_warning(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_issue_report_warning(uuid, text) TO authenticated;
