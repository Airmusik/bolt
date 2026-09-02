-- A report can only create one account warning. Make the moderation action
-- safe to retry so a stale page or double click cannot fail on the unique
-- report_id constraint or send the member duplicate notifications.
CREATE OR REPLACE FUNCTION public.admin_issue_report_warning(p_report_id uuid, p_message text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report public.reports%ROWTYPE;
  v_warning_id uuid;
  v_warning_count integer;
  v_body text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF char_length(trim(COALESCE(p_message, ''))) < 3 THEN RAISE EXCEPTION 'A warning message is required'; END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF v_report.reported_id IS NULL THEN RAISE EXCEPTION 'This report has no reported user'; END IF;

  INSERT INTO public.user_warnings (user_id, report_id, admin_id, message, report_reason, report_description)
  VALUES (v_report.reported_id, v_report.id, auth.uid(), trim(p_message), v_report.reason, v_report.description)
  ON CONFLICT (report_id) DO NOTHING
  RETURNING id INTO v_warning_id;

  SELECT count(*)::integer INTO v_warning_count
  FROM public.user_warnings
  WHERE user_id = v_report.reported_id;

  -- The warning already exists. Complete any earlier partially-finished
  -- moderation action, but do not notify the member a second time.
  IF v_warning_id IS NULL THEN
    UPDATE public.reports SET status = 'resolved' WHERE id = v_report.id;
    RETURN v_warning_count;
  END IF;

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
