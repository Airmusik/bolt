/*
# Add email column and allow driver availability self-update

1. Changes to profiles table:
   - Add `email` column (text, nullable) to store an optional real email address
     provided at registration. This email is used for password reset (PIN reset)
     via Supabase's built-in recovery email flow.

2. Security / RLS changes:
   - Recreate the `update_own_profile` UPDATE policy on `profiles` so that
     every authenticated user (including drivers) can update their own
     availability freely — both 'available' and 'unavailable'. The previous
     policy blocked drivers from self-setting 'available'; the product now
     requires drivers to toggle their own availability.
   - The admin_update_any_profile policy is preserved unchanged.

3. Important notes:
   - The email column is optional (nullable). Existing rows will have NULL.
   - No data is lost; only an additive column and a policy replacement.
*/

-- Add optional email column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Recreate the self-update policy to allow drivers to set their own availability
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);