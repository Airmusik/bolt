-- Discovery badges and eligibility must use the same actual proof approval.
CREATE OR REPLACE FUNCTION public.discover_drivers(p_limit integer DEFAULT 1000, p_verified_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(result)), '[]'::jsonb) FROM (
    SELECT p.id,p.role,p.full_name,p.avatar_url,p.bio,p.location,p.preferred_locations,p.availability,p.languages,p.age,p.driving_experience_years,p.platforms_worked,p.is_verified,p.verification_status,p.is_suspended,p.rating,p.rating_count,p.onboarding_completed,p.created_at,p.updated_at,p.platform_history_approved,p.platform_history_submitted,
      EXISTS (SELECT 1 FROM public.active_promotion_targets() a WHERE a.kind = 'profile' AND a.target_id = p.id) AS sponsored
    FROM public.profiles p WHERE p.role = 'driver' AND p.onboarding_completed AND NOT p.is_suspended AND (NOT p_verified_only OR p.platform_history_approved)
    ORDER BY sponsored DESC,p.platform_history_approved DESC,p.rating DESC,p.created_at DESC,p.id
    LIMIT greatest(1, least(COALESCE(p_limit,1000),1000))
  ) result;
$$;
NOTIFY pgrst, 'reload schema';
