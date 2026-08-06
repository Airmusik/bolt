/*
# Admin account setup, email lookup, and document storage access for admins

## Overview
1. Promotes the existing user with phone 0708593011 to admin role.
2. Sets their auth password to match PIN 1953 (using Gli!k_ prefix).
3. Creates SECURITY DEFINER functions get_email_by_phone and is_admin.
4. Adds storage SELECT policy allowing admins to read all documents.
5. Updates auto_admin_profile trigger for future admin emails.
*/

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- Helper functions ----------

CREATE OR REPLACE FUNCTION public.get_email_by_phone(p_phone text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.profiles
  WHERE phone = p_phone AND email IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------- Storage policy: admins can read all documents ----------

DROP POLICY IF EXISTS "documents_read_admin" ON storage.objects;
CREATE POLICY "documents_read_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin());

-- ---------- Update auto_admin_profile trigger ----------

CREATE OR REPLACE FUNCTION public.auto_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IN ('admin@garilink.app', '254708593011@garilink.app', '0708593011@garilink.app') THEN
    INSERT INTO public.profiles (id, role, full_name, phone)
    VALUES (NEW.id, 'admin', 'Site Admin', '+254708593011')
    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Site Admin';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- Promote existing user to admin ----------

DO $$
BEGIN
  -- Update the auth user's password to match PIN 1953
  UPDATE auth.users
  SET encrypted_password = extensions.crypt('Gli!k_1953', extensions.gen_salt('bf')),
      email_confirmed_at = now(),
      raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', 'Site Admin', 'role', 'admin')
  WHERE email = '0708593011@garilink.app';

  -- Promote the profile to admin
  UPDATE public.profiles
  SET role = 'admin',
      full_name = 'Site Admin',
      is_verified = true,
      verification_status = 'approved'
  WHERE phone = '+254708593011';
END;
$$;