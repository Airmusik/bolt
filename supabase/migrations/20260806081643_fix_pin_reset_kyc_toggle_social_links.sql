/*
# Fix admin PIN reset, add KYC toggle, add social media links

## 1. Fix admin_change_user_pin function
The existing function uses unqualified crypt() and gen_salt() which fails
when pgcrypto is not on the search_path. This replaces it with a version
that uses extensions.crypt() and extensions.gen_salt() with a proper
search_path. A later migration enforces the current password policy.

## 2. Add KYC toggle setting
Adds a 'kyc_enabled' setting to site_settings, defaulting to 'false' (off).
When off, the driver onboarding document upload section is hidden and
verification is not required.

## 3. Add social media link settings
Adds settings for facebook_url, instagram_url, linkedin_url so the admin
can update social media links from the admin panel.

## Security
- No new tables created.
- admin_change_user_pin is SECURITY DEFINER and checks is_admin().
- site_settings is readable by all (existing policies) and writable by admin (existing policies).
*/

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Replace the broken admin_change_user_pin function
CREATE OR REPLACE FUNCTION public.admin_change_user_pin(p_user_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user PINs';
  END IF;
  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'Password too short';
  END IF;

  UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
        updated_at = now()
    WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_change_user_pin(uuid, text) TO authenticated;

-- Insert default settings if they don't exist
INSERT INTO site_settings (key, value, updated_at) VALUES
  ('kyc_enabled', 'false', now()),
  ('facebook_url', '', now()),
  ('instagram_url', '', now()),
  ('linkedin_url', '', now())
ON CONFLICT (key) DO NOTHING;
