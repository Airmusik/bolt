-- Remove an unfounded report from account standing without erasing the case history.
ALTER TABLE public.reports
  ADD COLUMN dismissed_at timestamptz,
  ADD COLUMN dismissed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN dismissal_reason text CHECK (length(dismissal_reason) BETWEEN 10 AND 2000);
ALTER TABLE public.user_warnings
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN revocation_reason text;

CREATE FUNCTION public.protect_report_dismissal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.dismissed_at := NULL; NEW.dismissed_by := NULL; NEW.dismissal_reason := NULL;
  ELSE
    IF OLD.dismissed_at IS NOT NULL AND
      ROW(NEW.status,NEW.dismissed_at,NEW.dismissed_by,NEW.dismissal_reason,NEW.reported_id)
      IS DISTINCT FROM ROW(OLD.status,OLD.dismissed_at,OLD.dismissed_by,OLD.dismissal_reason,OLD.reported_id)
    THEN RAISE EXCEPTION 'A removed report cannot be reopened or reassigned'; END IF;
    IF NEW.dismissed_at IS DISTINCT FROM OLD.dismissed_at THEN
      IF NOT public.is_admin() OR NEW.status <> 'dismissed' OR NEW.dismissed_by IS DISTINCT FROM auth.uid()
        OR length(trim(coalesce(NEW.dismissal_reason,''))) NOT BETWEEN 10 AND 2000
      THEN RAISE EXCEPTION 'An administrator and a removal reason are required'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_report_dismissal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_report_dismissal BEFORE INSERT OR UPDATE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.protect_report_dismissal();

CREATE FUNCTION public.admin_overturn_report(p_report_id uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reports%ROWTYPE; before_rating numeric; after_rating numeric; revoked integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF length(trim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'Explain why the report is being removed (10–2000 characters)'; END IF;
  SELECT * INTO r FROM public.reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  SELECT rating INTO before_rating FROM public.profiles WHERE id=r.reported_id FOR UPDATE;
  IF r.dismissed_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_removed',true,'rating_before',before_rating,'rating_after',before_rating);
  END IF;
  UPDATE public.user_warnings SET revoked_at=now(),revoked_by=auth.uid(),revocation_reason=trim(p_reason)
    WHERE report_id=r.id AND revoked_at IS NULL;
  GET DIAGNOSTICS revoked=ROW_COUNT;
  UPDATE public.reports SET status='dismissed',dismissed_at=now(),dismissed_by=auth.uid(),dismissal_reason=trim(p_reason) WHERE id=r.id;
  -- Recalculate from remaining reports and genuine reviews; never blindly add a star or reset to 5.
  IF r.reported_id IS NOT NULL THEN
    PERFORM public.recalculate_profile_rating(r.reported_id);
    SELECT rating INTO after_rating FROM public.profiles WHERE id=r.reported_id;
    INSERT INTO public.notifications(user_id,type,title,body,data) VALUES (
      r.reported_id,'system','Report removed from your account',
      'Report: '||r.reason||'. Admin decision: '||trim(p_reason)||
      '. This report no longer affects your rating or active warning count. Your rating is now '||after_rating||'/5. Other reviews and valid reports still apply.',
      jsonb_build_object('report_id',r.id,'path','/members/'||r.reported_id::text,'rating_before',before_rating,'rating_after',after_rating)
    );
  END IF;
  RETURN jsonb_build_object('already_removed',false,'rating_before',before_rating,'rating_after',after_rating,'warnings_revoked',revoked);
END $$;
REVOKE ALL ON FUNCTION public.admin_overturn_report(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_overturn_report(uuid,text) TO authenticated;

-- Serialize warnings against removal, reject dismissed cases, and count only active warnings.
CREATE OR REPLACE FUNCTION public.admin_issue_report_warning(p_report_id uuid,p_message text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.reports%ROWTYPE; warning_id uuid; warning_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF length(trim(coalesce(p_message,''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'A warning message of 3–2000 characters is required'; END IF;
  SELECT * INTO r FROM public.reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF r.status='dismissed' THEN RAISE EXCEPTION 'A dismissed report cannot create a warning'; END IF;
  IF r.reported_id IS NULL THEN RAISE EXCEPTION 'This report has no reported user'; END IF;
  PERFORM 1 FROM public.profiles WHERE id=r.reported_id FOR UPDATE;
  INSERT INTO public.user_warnings(user_id,report_id,admin_id,message,report_reason,report_description)
    VALUES(r.reported_id,r.id,auth.uid(),trim(p_message),r.reason,r.description)
    ON CONFLICT(report_id) DO NOTHING RETURNING id INTO warning_id;
  SELECT count(*)::integer INTO warning_count FROM public.user_warnings WHERE user_id=r.reported_id AND revoked_at IS NULL;
  IF warning_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id,type,title,body,data) VALUES (
      r.reported_id,'warning','Account warning related to a report',
      'Report: '||r.reason||'. '||CASE WHEN nullif(trim(coalesce(r.description,'')),'') IS NOT NULL THEN 'Details: '||trim(r.description)||'. ' ELSE '' END||
      'Admin message: '||trim(p_message)||'. This is warning '||warning_count||'. Three warnings may lead to account suspension.',
      jsonb_build_object('report_id',r.id,'report_reason',r.reason,'target_type',r.target_type,'warning_count',warning_count)
    );
  END IF;
  UPDATE public.reports SET status='resolved' WHERE id=r.id;
  RETURN warning_count;
END $$;
REVOKE ALL ON FUNCTION public.admin_issue_report_warning(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_issue_report_warning(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_account_standing() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'rating',p.rating,
    'review_average',coalesce((SELECT round(avg(rating)::numeric,1) FROM public.reviews WHERE reviewee_id=auth.uid()),5),
    'review_count',(SELECT count(*) FROM public.reviews WHERE reviewee_id=auth.uid()),
    'reports',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'reason',reason,'description',description,'status',status,'created_at',created_at) ORDER BY created_at DESC) FROM public.reports WHERE reported_id=auth.uid() AND status IN ('reviewing','resolved')),'[]'::jsonb),
    'warnings',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'message',message,'report_reason',report_reason,'report_description',report_description,'created_at',created_at) ORDER BY created_at DESC) FROM public.user_warnings WHERE user_id=auth.uid() AND revoked_at IS NULL),'[]'::jsonb),
    'removed_reports',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'reason',reason,'dismissal_reason',dismissal_reason,'dismissed_at',dismissed_at) ORDER BY dismissed_at DESC) FROM public.reports WHERE reported_id=auth.uid() AND status='dismissed' AND dismissed_at IS NOT NULL),'[]'::jsonb)
  ) FROM public.profiles p WHERE p.id=auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_account_standing() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.my_account_standing() TO authenticated;
NOTIFY pgrst,'reload schema';
