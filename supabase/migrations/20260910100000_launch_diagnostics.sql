CREATE SCHEMA IF NOT EXISTS operations_private;
REVOKE ALL ON SCHEMA operations_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS operations_private.client_diagnostics (
  hour timestamptz NOT NULL, route text NOT NULL, kind text NOT NULL, browser text NOT NULL,
  release text NOT NULL, hits integer NOT NULL DEFAULT 1, last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(hour, route, kind, browser)
);
REVOKE ALL ON operations_private.client_diagnostics FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.record_client_diagnostic(p_route text, p_kind text, p_browser text, p_release text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE bucket timestamptz := date_trunc('hour',now()); first_report boolean;
BEGIN
  IF p_route IS NULL OR p_route NOT IN ('/','/login','/register','/reset-password','/auth/callback','/dashboard','/browse-cars','/browse-drivers','/vehicles/new','/vehicles/detail','/vehicles/edit','/drivers/detail','/members/detail','/onboarding','/chat','/chat/detail','/contact','/updates','/notifications','/settings','/admin','/admin/login','/promotions','/saved','/help','/about','/terms','/privacy','/other')
    OR p_kind IS NULL OR p_kind NOT IN ('render','runtime','promise','chunk') OR p_browser IS NULL OR p_browser NOT IN ('chrome','safari','firefox','edge','other')
    OR p_release IS NULL OR p_release !~ '^([a-f0-9]{7,40}|local)$' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(91010001);
  -- Bounded storage even for forged reports. These untrusted browser signals
  -- never restrict accounts. One admin notification per hour at most.
  IF (SELECT coalesce(sum(hits),0) FROM operations_private.client_diagnostics WHERE hour=bucket)>=1000 THEN RETURN; END IF;
  first_report := NOT EXISTS(SELECT 1 FROM operations_private.client_diagnostics WHERE hour=bucket);
  INSERT INTO operations_private.client_diagnostics(hour,route,kind,browser,release) VALUES(bucket,p_route,p_kind,p_browser,p_release)
    ON CONFLICT(hour,route,kind,browser) DO UPDATE SET hits=client_diagnostics.hits+1,last_seen=now(),release=EXCLUDED.release;
  DELETE FROM operations_private.client_diagnostics WHERE hour < now()-interval '30 days';
  IF first_report THEN
    INSERT INTO public.notifications(user_id,type,title,body,data)
      SELECT id,'site_error','Site error reported','A browser reported a page problem. Review Website health in the Security section. Reports contain no message or form contents.',jsonb_build_object('path','/admin?tab=security')
      FROM public.profiles WHERE role='admin' AND NOT coalesce(is_suspended,false);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.record_client_diagnostic(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_client_diagnostic(text,text,text,text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_client_diagnostics() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
BEGIN
  IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(row),'[]') FROM (SELECT hour,route,kind,browser,release,hits,last_seen FROM operations_private.client_diagnostics WHERE hour>now()-interval '30 days' ORDER BY last_seen DESC LIMIT 100) row);
END $$;
REVOKE ALL ON FUNCTION public.admin_client_diagnostics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_client_diagnostics() TO authenticated;
