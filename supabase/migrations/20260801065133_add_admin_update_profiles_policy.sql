/*
# Allow admin to update any profile

The existing `profiles_update_self` policy only allows auth.uid() = id.
Admins need to update other users' profiles (verification status, suspension, etc.).
This adds a separate policy allowing admins to update any profile row.
*/

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
