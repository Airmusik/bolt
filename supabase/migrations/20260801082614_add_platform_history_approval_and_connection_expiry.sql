/*
# Platform history approval + connection expiry

## Changes
1. Add `approved` boolean column to `driver_platform_history` for admin approval of proof images
2. Add `expire_old_connections()` SECURITY DEFINER function
3. Add 'expired' to connections status check constraint
*/

ALTER TABLE public.driver_platform_history
  ADD COLUMN IF NOT EXISTS approved boolean DEFAULT false;

-- Add 'expired' and 'ended' to allowed connection statuses
ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_status_check;
ALTER TABLE public.connections ADD CONSTRAINT connections_status_check
  CHECK (status IN ('pending','accepted','rejected','withdrawn','expired','ended'));

-- Add admin update policy for driver_platform_history
DROP POLICY IF EXISTS "dph_update_admin" ON public.driver_platform_history;
CREATE POLICY "dph_update_admin" ON public.driver_platform_history
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.expire_old_connections()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.connections
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '7 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_old_connections() TO authenticated;
