BEGIN;
CREATE TABLE public.site_visits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  country text NOT NULL DEFAULT 'ZZ',
  is_view boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_visits_time ON public.site_visits(created_at);
CREATE INDEX site_visits_session_time ON public.site_visits(session_id, created_at DESC);
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_visits FROM anon, authenticated;

CREATE FUNCTION public.record_site_visit(p_session uuid, p_path text, p_view boolean, p_country text DEFAULT 'ZZ')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.is_admin() OR p_session IS NULL OR p_path IS NULL OR p_view IS NULL THEN RETURN; END IF;
  IF p_path !~ '^/(|dashboard|browse-cars|browse-drivers|vehicles|vehicles/detail|drivers|drivers/detail|members/detail|login|register|chat|chat/detail|settings|promotions|saved|notifications|about|contact|help|privacy|terms|how-it-works|onboarding|other)$' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text, 0));
  -- Limit both repeated views and presence pings; no public read access.
  IF EXISTS (SELECT 1 FROM public.site_visits WHERE session_id=p_session AND created_at > now()-interval '2 seconds') THEN RETURN; END IF;
  IF NOT p_view AND EXISTS (SELECT 1 FROM public.site_visits WHERE session_id=p_session AND created_at > now()-interval '50 seconds') THEN RETURN; END IF;
  IF (SELECT count(*) FROM public.site_visits WHERE session_id=p_session AND created_at > now()-interval '1 hour') >= 240 THEN RETURN; END IF;
  INSERT INTO public.site_visits(session_id,user_id,path,country,is_view)
  VALUES(p_session,auth.uid(),p_path,CASE WHEN p_country ~ '^[A-Z]{2}$' THEN p_country ELSE 'ZZ' END,p_view);
  DELETE FROM public.site_visits WHERE id IN (SELECT id FROM public.site_visits WHERE created_at < now()-interval '90 days' LIMIT 1000);
END $$;
REVOKE ALL ON FUNCTION public.record_site_visit(uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_site_visit(uuid,text,boolean,text) TO anon,authenticated;

CREATE FUNCTION public.admin_site_analytics(p_start date, p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start OR p_end-p_start > 90 THEN RAISE EXCEPTION 'Choose a valid range of up to 90 days'; END IF;
  WITH visits AS (
    SELECT * FROM public.site_visits WHERE created_at >= p_start::timestamp AT TIME ZONE 'UTC' AND created_at < (p_end+1)::timestamp AT TIME ZONE 'UTC' AND created_at >= now()-interval '90 days'
  ), days AS (
    SELECT generate_series(p_start::timestamp,p_end::timestamp,interval '1 day')::date AS day
  ), totals AS (
    SELECT count(*) FILTER (WHERE is_view) AS views, count(DISTINCT session_id) AS sessions, count(DISTINCT user_id) AS active_members FROM visits
  )
  SELECT jsonb_build_object(
    'views',t.views,'sessions',t.sessions,'active_members',t.active_members,
    'online',(SELECT count(DISTINCT user_id) FROM public.site_visits WHERE created_at > now()-interval '5 minutes'),
    'signups',(SELECT count(*) FROM public.profiles WHERE role <> 'admin' AND created_at >= p_start::timestamp AT TIME ZONE 'UTC' AND created_at < (p_end+1)::timestamp AT TIME ZONE 'UTC'),
    'logged_in',(SELECT count(*) FROM auth.users u JOIN public.profiles p ON p.id=u.id WHERE p.role <> 'admin' AND u.last_sign_in_at >= p_start::timestamp AT TIME ZONE 'UTC' AND u.last_sign_in_at < (p_end+1)::timestamp AT TIME ZONE 'UTC'),
    'listings',(SELECT count(*) FROM public.vehicles WHERE created_at >= p_start::timestamp AT TIME ZONE 'UTC' AND created_at < (p_end+1)::timestamp AT TIME ZONE 'UTC'),
    'connections',(SELECT count(*) FROM public.connections WHERE created_at >= p_start::timestamp AT TIME ZONE 'UTC' AND created_at < (p_end+1)::timestamp AT TIME ZONE 'UTC'),
    'tracking_since',(SELECT min(created_at) FROM public.site_visits),
    'daily',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',d.day,'views',(SELECT count(*) FROM visits v WHERE v.is_view AND (v.created_at AT TIME ZONE 'UTC')::date=d.day),'signups',(SELECT count(*) FROM public.profiles p WHERE p.role <> 'admin' AND (p.created_at AT TIME ZONE 'UTC')::date=d.day)) ORDER BY d.day),'[]') FROM days d),
    'pages',(SELECT coalesce(jsonb_agg(x ORDER BY x.views DESC),'[]') FROM (SELECT path,count(*) AS views FROM visits WHERE is_view GROUP BY path ORDER BY views DESC LIMIT 15) x),
    'countries',(SELECT coalesce(jsonb_agg(x ORDER BY x.sessions DESC),'[]') FROM (SELECT country,count(DISTINCT session_id) AS sessions,count(*) FILTER (WHERE is_view) AS views FROM visits GROUP BY country ORDER BY sessions DESC) x)
  ) INTO result FROM totals t;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_site_analytics(date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_site_analytics(date,date) TO authenticated;
COMMIT;
