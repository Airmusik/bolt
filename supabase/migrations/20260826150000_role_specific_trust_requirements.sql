-- Keep owner evidence attached to the relevant vehicle and require drivers to
-- provide real platform proof before requesting Trust Passport review.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documents_vehicle ON public.documents(vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_vehicle_type_unique
  ON public.documents(user_id, vehicle_id, type)
  WHERE vehicle_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_signup_phone_available(p_phone text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE phone = p_phone
  );
$$;
REVOKE ALL ON FUNCTION public.is_signup_phone_available(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_signup_phone_available(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_profile_verification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT role INTO current_role FROM public.profiles WHERE id = auth.uid();
  IF current_role IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended) THEN
    RAISE EXCEPTION 'Suspended accounts cannot request verification';
  END IF;

  IF current_role = 'driver' AND NOT EXISTS (
    SELECT 1
    FROM public.driver_platform_history
    WHERE driver_id = auth.uid()
      AND months_active > 0
      AND proof_url IS NOT NULL
      AND length(trim(proof_url)) > 0
  ) THEN
    RAISE EXCEPTION 'At least one platform history entry with proof is required';
  END IF;

  PERFORM set_config('app.profile_system_update', 'on', true);
  UPDATE public.profiles
  SET verification_status = 'pending', is_verified = false
  WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.submit_profile_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_profile_verification() TO authenticated;
