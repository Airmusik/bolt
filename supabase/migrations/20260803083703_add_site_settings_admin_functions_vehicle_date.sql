/*
# Site settings, admin user management, vehicle available-from date

1. New Tables
- `site_settings` — key-value store for platform-wide settings (maintenance mode, fees, etc.)

2. New Functions (SECURITY DEFINER)
- `admin_change_user_pin(p_user_id, p_new_password)` — admin can reset any user's password (PIN)
- `admin_delete_user(p_user_id)` — admin can permanently delete a user and all their data

3. New Columns
- `vehicles.available_from` — date the vehicle becomes available (defaults to creation date)

4. Security
- `site_settings`: RLS enabled, admin-only write, all authenticated can read
- Both functions check `is_admin()` before performing the action
*/

-- ---------- site_settings ----------
CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_read_all" ON site_settings;
CREATE POLICY "settings_read_all" ON site_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_admin_write" ON site_settings;
CREATE POLICY "settings_admin_write" ON site_settings FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "settings_admin_update" ON site_settings;
CREATE POLICY "settings_admin_update" ON site_settings FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "settings_admin_delete" ON site_settings;
CREATE POLICY "settings_admin_delete" ON site_settings FOR DELETE
  TO authenticated USING (is_admin());

-- Seed default settings
INSERT INTO site_settings (key, value) VALUES
  ('site_name', 'GariLink'),
  ('maintenance_mode', 'false'),
  ('max_vehicles_per_owner', '10'),
  ('require_email', 'true'),
  ('platform_fee_percent', '0'),
  ('admin_contact_email', 'airmusikinck@gmail.com'),
  ('admin_contact_phone', '+254708593011')
ON CONFLICT (key) DO NOTHING;

-- ---------- vehicles.available_from ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'available_from') THEN
    ALTER TABLE vehicles ADD COLUMN available_from date;
  END IF;
END $$;

-- ---------- admin_change_user_pin ----------
CREATE OR REPLACE FUNCTION admin_change_user_pin(p_user_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can change user PINs';
  END IF;
  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'Password too short';
  END IF;
  UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf'))
    WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_change_user_pin TO authenticated;

-- ---------- admin_delete_user ----------
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can delete users';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own admin account';
  END IF;

  -- Delete user's related data
  DELETE FROM messages WHERE sender_id = p_user_id;
  DELETE FROM notifications WHERE user_id = p_user_id;
  DELETE FROM documents WHERE user_id = p_user_id;
  DELETE FROM driver_platform_history WHERE driver_id = p_user_id;
  DELETE FROM reports WHERE reporter_id = p_user_id;
  DELETE FROM favorites WHERE user_id = p_user_id;
  DELETE FROM blocks WHERE blocker_id = p_user_id OR blocked_id = p_user_id;
  DELETE FROM reviews WHERE reviewer_id = p_user_id OR reviewee_id = p_user_id;

  -- Delete vehicles and their children
  DELETE FROM vehicle_photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE owner_id = p_user_id);
  DELETE FROM vehicle_issues WHERE vehicle_id IN (SELECT id FROM vehicles WHERE owner_id = p_user_id);
  DELETE FROM vehicles WHERE owner_id = p_user_id;

  -- Delete conversations involving the user
  DELETE FROM messages WHERE conversation_id IN (
    SELECT id FROM conversations WHERE driver_id = p_user_id OR owner_id = p_user_id
  );
  DELETE FROM conversations WHERE driver_id = p_user_id OR owner_id = p_user_id;

  -- Delete connections
  DELETE FROM connections WHERE requester_id = p_user_id OR recipient_id = p_user_id;

  -- Delete profile
  DELETE FROM profiles WHERE id = p_user_id;

  -- Finally delete from auth.users
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_delete_user TO authenticated;

-- ---------- Allow users to create admin conversations ----------
-- The existing conv_insert_parties policy already allows:
-- auth.uid() = driver_id OR auth.uid() = owner_id OR (auth.uid() = admin_id AND is_admin())
-- So a user can create a conversation where they are driver/owner and set admin_id to the admin.
-- No policy change needed.
