-- Rank before LIMIT. These invoker functions retain existing RLS, moderation,
-- and the explicit public profile projection (no email/phone/payment data).
CREATE FUNCTION public.discover_vehicles(p_limit integer DEFAULT 1000) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(result)), '[]'::jsonb) FROM (
    SELECT v.*,
      (SELECT to_jsonb(member) FROM (SELECT p.id,p.role,p.full_name,p.avatar_url,p.location,p.is_verified,p.rating,p.rating_count,p.availability,p.created_at FROM public.profiles p WHERE p.id = v.owner_id) member) AS owner,
      (SELECT COALESCE(jsonb_agg(ph ORDER BY ph.position), '[]'::jsonb) FROM public.vehicle_photos ph WHERE ph.vehicle_id = v.id) AS photos,
      (SELECT COALESCE(jsonb_agg(i), '[]'::jsonb) FROM public.vehicle_issues i WHERE i.vehicle_id = v.id) AS issues,
      EXISTS (SELECT 1 FROM public.active_promotion_targets() a WHERE (a.kind = 'listing' AND a.target_id = v.id) OR (a.kind = 'profile' AND a.target_id = v.owner_id)) AS sponsored
    FROM public.vehicles v
    WHERE v.status = 'active' AND v.approval_status = 'approved' AND v.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.owner_id AND NOT p.is_suspended)
    ORDER BY sponsored DESC, v.created_at DESC, v.id
    LIMIT greatest(1, least(COALESCE(p_limit,1000),1000))
  ) result;
$$;
CREATE FUNCTION public.discover_drivers(p_limit integer DEFAULT 1000, p_verified_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(result)), '[]'::jsonb) FROM (
    SELECT p.id,p.role,p.full_name,p.avatar_url,p.bio,p.location,p.preferred_locations,p.availability,p.languages,p.age,p.driving_experience_years,p.platforms_worked,p.is_verified,p.verification_status,p.is_suspended,p.rating,p.rating_count,p.onboarding_completed,p.created_at,p.updated_at,p.platform_history_approved,p.platform_history_submitted,
      EXISTS (SELECT 1 FROM public.active_promotion_targets() a WHERE a.kind = 'profile' AND a.target_id = p.id) AS sponsored
    FROM public.profiles p WHERE p.role = 'driver' AND p.onboarding_completed AND NOT p.is_suspended AND (NOT p_verified_only OR p.is_verified)
    ORDER BY sponsored DESC,p.is_verified DESC,p.rating DESC,p.created_at DESC,p.id
    LIMIT greatest(1, least(COALESCE(p_limit,1000),1000))
  ) result;
$$;
REVOKE ALL ON FUNCTION public.discover_vehicles(integer), public.discover_drivers(integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_vehicles(integer), public.discover_drivers(integer,boolean) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
