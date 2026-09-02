-- Expiry is evaluated at read/write time, not dependent on a periodic job.
-- No listing, message, payment, or legal record is removed at expiry.
CREATE FUNCTION public.live_promotions()
RETURNS TABLE(id uuid, kind text, target_id uuid, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id,r.kind,COALESCE(r.vehicle_id,r.user_id),r.expires_at
  FROM public.promotion_requests r JOIN public.profiles p ON p.id=r.user_id
  WHERE r.status='active' AND r.starts_at<=now() AND r.expires_at>now()
    AND NOT p.is_suspended AND p.document_listing_visibility='public'
    AND (p.role='owner' OR p.onboarding_completed)
    AND EXISTS(SELECT 1 FROM public.promotion_settings WHERE id AND enabled)
    AND (r.kind='profile' OR EXISTS(SELECT 1 FROM public.vehicles v WHERE v.id=r.vehicle_id
      AND v.status='active' AND v.approval_status='approved' AND v.deleted_at IS NULL AND v.document_listing_visibility='public'))
  ORDER BY r.id;
$$;
CREATE OR REPLACE FUNCTION public.active_promotion_targets()
RETURNS TABLE(kind text,target_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT DISTINCT l.kind,l.target_id FROM public.live_promotions() l;
$$;
REVOKE ALL ON FUNCTION public.live_promotions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_promotions() TO anon,authenticated;

CREATE TABLE public.promotion_events (
  promotion_id uuid NOT NULL REFERENCES public.promotion_requests(id) ON DELETE CASCADE,
  visitor_hash text NOT NULL,
  event text NOT NULL CHECK(event IN ('reach','click')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(promotion_id,visitor_hash,event)
);
ALTER TABLE public.promotion_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.promotion_events FROM anon,authenticated;

CREATE FUNCTION public.record_promotion_event(p_id uuid,p_visitor uuid,p_event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_hash text;
BEGIN
  IF p_visitor IS NULL OR p_event NOT IN ('reach','click') OR p_event IS NULL THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.live_promotions() l JOIN public.promotion_requests r ON r.id=l.id
    WHERE l.id=p_id AND r.user_id IS DISTINCT FROM auth.uid()) OR public.is_admin() THEN RETURN; END IF;
  -- Campaign-scoped hashes: raw visitor IDs and user IDs are never stored.
  v_hash:=md5(p_id::text||p_visitor::text);
  INSERT INTO public.promotion_events(promotion_id,visitor_hash,event) VALUES(p_id,v_hash,'reach') ON CONFLICT DO NOTHING;
  IF p_event='click' THEN
    INSERT INTO public.promotion_events(promotion_id,visitor_hash,event) VALUES(p_id,v_hash,'click') ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_promotion_event(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_promotion_event(uuid,uuid,text) TO anon,authenticated;

CREATE FUNCTION public.promotion_analytics()
RETURNS TABLE(promotion_id uuid,reach bigint,clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id,count(e.event) FILTER(WHERE e.event='reach'),count(e.event) FILTER(WHERE e.event='click')
  FROM public.promotion_requests r LEFT JOIN public.promotion_events e ON e.promotion_id=r.id
  WHERE auth.uid() IS NOT NULL AND (r.user_id=auth.uid() OR public.is_admin())
  GROUP BY r.id;
$$;
REVOKE ALL ON FUNCTION public.promotion_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promotion_analytics() TO authenticated;
NOTIFY pgrst,'reload schema';
