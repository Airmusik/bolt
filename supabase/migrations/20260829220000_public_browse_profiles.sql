-- Allow visitors to browse the intentionally public part of active member profiles.
-- Private registration details, document dates, and presence data remain unavailable.

GRANT SELECT (
  id,
  role,
  full_name,
  avatar_url,
  bio,
  location,
  preferred_locations,
  availability,
  languages,
  age,
  driving_experience_years,
  platforms_worked,
  is_verified,
  verification_status,
  is_suspended,
  rating,
  rating_count,
  onboarding_completed,
  created_at,
  updated_at
) ON public.profiles TO anon;

DROP POLICY IF EXISTS "profiles_read_public_browse" ON public.profiles;
CREATE POLICY "profiles_read_public_browse" ON public.profiles
  FOR SELECT TO anon
  USING (
    role IN ('owner', 'driver')
    AND NOT is_suspended
    AND (role <> 'driver' OR onboarding_completed)
  );
