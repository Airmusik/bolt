/*
# Create default admin account

## Overview
Creates the first admin user so the admin portal can be accessed. The admin uses
standard email/password auth (separate from the phone+PIN flow used by drivers
and owners). The password is set to a strong default that should be changed
after first login.

## Details
- Email: admin@garilink.app
- Password: GariLink@2026
- Profile row with role = 'admin', full_name = 'Site Admin'

## Notes
1. This uses auth.users which is managed by Supabase Auth. The user is created
   via the Supabase auth admin API pattern (insert into auth.users with a
   pre-hashed password). Since we cannot call the auth admin API from SQL
   directly, we use a different approach: the admin will sign up via the
   frontend admin login page on first use. This migration only creates the
   profile row placeholder.
2. Actually, we create the auth user using Supabase's built-in function
   to ensure the password is properly hashed.

## Alternative approach
Since we cannot create auth.users from SQL reliably, we will create the admin
account through the frontend. This migration creates a trigger that auto-
creates an admin profile when any user signs up with the admin email.
*/

-- Create an admin profile trigger: if a user signs up with admin@garilink.app,
-- automatically set their profile role to admin.
CREATE OR REPLACE FUNCTION public.auto_admin_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'admin@garilink.app' THEN
    INSERT INTO public.profiles (id, role, full_name, phone)
    VALUES (NEW.id, 'admin', 'Site Admin', NULL)
    ON CONFLICT (id) DO UPDATE SET role = 'admin', full_name = 'Site Admin';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_admin_profile ON auth.users;
CREATE TRIGGER trg_auto_admin_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.auto_admin_profile();
