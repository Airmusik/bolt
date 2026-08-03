/*
# Fix admin PIN reset hashing

Ensures pgcrypto is installed in the extensions schema and replaces the admin PIN
reset function so it uses schema-qualified hashing helpers. This avoids runtime
errors when the function search_path does not include pgcrypto.
*/

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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
