/*
# Security and workflow integrity repair

Closes privilege escalation, removes legacy admin/recovery backdoors, protects
private profile fields, makes workflow transitions authoritative, generates
notifications server-side, and keeps review aggregates consistent.
*/

-- ---------- Remove legacy privileged identity hooks ----------
DROP TRIGGER IF EXISTS trg_auto_admin_profile ON auth.users;
DROP FUNCTION IF EXISTS public.auto_admin_profile();
DROP FUNCTION IF EXISTS public.get_email_by_phone(text);

CREATE OR REPLACE FUNCTION public.admin_change_user_pin(p_user_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF length(p_new_password) < 10
    OR p_new_password !~ '[a-z]'
    OR p_new_password !~ '[A-Z]'
    OR p_new_password !~ '[0-9]'
  THEN
    RAISE EXCEPTION 'Password does not meet complexity requirements';
  END IF;
  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_change_user_pin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_pin(uuid, text) TO authenticated;

-- Disable any account matching the previously committed privileged identities.
-- A replacement admin must be provisioned through the Supabase dashboard.
UPDATE auth.users
SET encrypted_password = extensions.crypt(
      encode(extensions.gen_random_bytes(32), 'hex'),
      extensions.gen_salt('bf')
    ),
    updated_at = now()
WHERE email IN ('admin@garilink.app', '254708593011@garilink.app', '0708593011@garilink.app');

UPDATE public.profiles
SET role = 'owner', is_verified = false, verification_status = 'unverified'
WHERE id IN (
  SELECT id FROM auth.users
  WHERE email IN ('admin@garilink.app', '254708593011@garilink.app', '0708593011@garilink.app')
);

-- ---------- Profiles: safe signup/update/read ----------
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = id
    AND role IN ('owner', 'driver')
    AND is_verified = false
    AND verification_status = 'unverified'
  );

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin()
    AND current_setting('app.profile_system_update', true) IS DISTINCT FROM 'on'
    AND (
    NEW.role IS DISTINCT FROM OLD.role OR
    NEW.is_verified IS DISTINCT FROM OLD.is_verified OR
    NEW.verification_status IS DISTINCT FROM OLD.verification_status OR
    NEW.rating IS DISTINCT FROM OLD.rating OR
    NEW.rating_count IS DISTINCT FROM OLD.rating_count OR
    NEW.contracts_completed IS DISTINCT FROM OLD.contracts_completed OR
    NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR
    NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason OR
    NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
  ) THEN
    RAISE EXCEPTION 'Privileged profile fields may only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_fields();

REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, role, full_name, avatar_url, bio, location, preferred_locations,
  availability, languages, age, driving_experience_years, platforms_worked,
  licence_expiry, psv_badge_expiry, good_conduct_expiry, is_verified,
  verification_status, is_suspended, rating, rating_count,
  contracts_completed, created_at, updated_at
) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  RETURN QUERY SELECT * FROM public.profiles ORDER BY created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_profile_verification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended) THEN
    RAISE EXCEPTION 'Suspended accounts cannot request verification';
  END IF;
  PERFORM set_config('app.profile_system_update', 'on', true);
  UPDATE public.profiles
  SET verification_status = 'pending', is_verified = false
  WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.submit_profile_verification() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_profile_verification() TO authenticated;

-- ---------- Applications: validate creation and transitions ----------
DROP POLICY IF EXISTS "app_insert_driver" ON public.applications;
CREATE POLICY "app_insert_driver" ON public.applications
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = driver_id
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND v.owner_id = owner_id AND v.status = 'active'
    )
  );

DROP POLICY IF EXISTS "app_update_owner_driver" ON public.applications;
CREATE POLICY "app_update_admin" ON public.applications
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.transition_application(p_application_id uuid, p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_conversation_id uuid;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  IF p_status IN ('accepted', 'rejected', 'completed') THEN
    IF auth.uid() <> v_app.owner_id AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'Only the vehicle owner can perform this transition';
    END IF;
  ELSIF p_status = 'withdrawn' THEN
    IF auth.uid() <> v_app.driver_id THEN
      RAISE EXCEPTION 'Only the driver can withdraw an application';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid application status';
  END IF;

  IF v_app.status <> 'pending' AND NOT (v_app.status = 'accepted' AND p_status = 'completed') THEN
    RAISE EXCEPTION 'Invalid application transition from % to %', v_app.status, p_status;
  END IF;

  UPDATE public.applications SET status = p_status WHERE id = v_app.id;

  IF p_status = 'accepted' THEN
    INSERT INTO public.conversations (application_id, vehicle_id, driver_id, owner_id)
    VALUES (v_app.id, v_app.vehicle_id, v_app.driver_id, v_app.owner_id)
    ON CONFLICT (application_id) DO UPDATE SET application_id = EXCLUDED.application_id
    RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_app.driver_id,
    'application_' || p_status,
    'Application ' || p_status,
    'Your application was ' || p_status || '.',
    jsonb_build_object('application_id', v_app.id, 'conversation_id', v_conversation_id)
  );
  RETURN v_conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_application(uuid, text) TO authenticated;

-- ---------- Connections: role-aware transitions and notifications ----------
DROP POLICY IF EXISTS "conn_insert_requester" ON public.connections;
CREATE POLICY "conn_insert_requester" ON public.connections
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = requester_id
    AND requester_id <> recipient_id
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "conn_update_parties" ON public.connections;
CREATE POLICY "conn_update_admin" ON public.connections
  FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.notify_new_connection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    NEW.recipient_id, 'connection_request', 'New connection request',
    'You have a new connection request on GariLink.',
    jsonb_build_object('connection_id', NEW.id)
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_new_connection ON public.connections;
CREATE TRIGGER trg_notify_new_connection
  AFTER INSERT ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_connection();

CREATE OR REPLACE FUNCTION public.transition_connection(p_connection_id uuid, p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conn public.connections%ROWTYPE;
  v_requester_role text;
  v_recipient_role text;
  v_driver_id uuid;
  v_owner_id uuid;
  v_conversation_id uuid;
BEGIN
  SELECT * INTO v_conn FROM public.connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;
  IF v_conn.status <> 'pending' THEN RAISE EXCEPTION 'Connection is no longer pending'; END IF;

  IF p_status IN ('accepted', 'rejected') AND auth.uid() <> v_conn.recipient_id THEN
    RAISE EXCEPTION 'Only the recipient can accept or reject';
  ELSIF p_status = 'withdrawn' AND auth.uid() <> v_conn.requester_id THEN
    RAISE EXCEPTION 'Only the requester can withdraw';
  ELSIF p_status NOT IN ('accepted', 'rejected', 'withdrawn') THEN
    RAISE EXCEPTION 'Invalid connection status';
  END IF;

  UPDATE public.connections SET status = p_status WHERE id = v_conn.id;

  IF p_status = 'accepted' THEN
    SELECT role INTO v_requester_role FROM public.profiles WHERE id = v_conn.requester_id;
    SELECT role INTO v_recipient_role FROM public.profiles WHERE id = v_conn.recipient_id;
    IF v_requester_role = 'driver' THEN v_driver_id := v_conn.requester_id; END IF;
    IF v_recipient_role = 'driver' THEN v_driver_id := v_conn.recipient_id; END IF;
    IF v_requester_role = 'owner' THEN v_owner_id := v_conn.requester_id; END IF;
    IF v_recipient_role = 'owner' THEN v_owner_id := v_conn.recipient_id; END IF;
    IF v_driver_id IS NULL OR v_owner_id IS NULL THEN
      RAISE EXCEPTION 'Connections must pair one driver with one owner';
    END IF;

    INSERT INTO public.conversations (connection_id, vehicle_id, driver_id, owner_id)
    VALUES (v_conn.id, v_conn.vehicle_id, v_driver_id, v_owner_id)
    ON CONFLICT (connection_id) DO UPDATE SET connection_id = EXCLUDED.connection_id
    RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    CASE WHEN auth.uid() = v_conn.requester_id THEN v_conn.recipient_id ELSE v_conn.requester_id END,
    'connection_' || p_status,
    'Connection ' || p_status,
    'Your connection request was ' || p_status || '.',
    jsonb_build_object('connection_id', v_conn.id, 'conversation_id', v_conversation_id)
  );
  RETURN v_conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_connection(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_connection(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.end_connection(p_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conn public.connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn FROM public.connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;
  IF auth.uid() NOT IN (v_conn.requester_id, v_conn.recipient_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not a connection participant';
  END IF;
  IF v_conn.status <> 'accepted' THEN RAISE EXCEPTION 'Only accepted connections can be ended'; END IF;
  UPDATE public.connections SET status = 'ended' WHERE id = v_conn.id;
  UPDATE public.profiles SET availability = 'available'
  WHERE id IN (v_conn.requester_id, v_conn.recipient_id) AND role = 'driver';
END;
$$;
REVOKE ALL ON FUNCTION public.end_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_connection(uuid) TO authenticated;

-- Conversations must correspond to an accepted workflow, or be an admin chat.
DROP POLICY IF EXISTS "conv_insert_parties" ON public.conversations;
CREATE POLICY "conv_insert_validated" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (
    (
      application_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.id = application_id AND a.status = 'accepted'
          AND a.vehicle_id IS NOT DISTINCT FROM vehicle_id
          AND a.driver_id IS NOT DISTINCT FROM driver_id
          AND a.owner_id IS NOT DISTINCT FROM owner_id
          AND auth.uid() IN (a.driver_id, a.owner_id)
      )
    ) OR (
      connection_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.connections c
        WHERE c.id = connection_id AND c.status = 'accepted'
          AND auth.uid() IN (c.requester_id, c.recipient_id)
      )
    ) OR (
      admin_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = admin_id AND p.role = 'admin')
      AND (auth.uid() IN (driver_id, owner_id) OR (auth.uid() = admin_id AND public.is_admin()))
    )
  );

-- ---------- Chat blocking and server-side message notifications ----------
CREATE OR REPLACE FUNCTION public.can_send_to_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND auth.uid() IN (c.driver_id, c.owner_id, c.admin_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = auth.uid() AND b.blocked_id IN (c.driver_id, c.owner_id, c.admin_id))
           OR (b.blocked_id = auth.uid() AND b.blocker_id IN (c.driver_id, c.owner_id, c.admin_id))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_send_to_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_to_conversation(uuid) TO authenticated;

DROP POLICY IF EXISTS "msg_insert_parties" ON public.messages;
CREATE POLICY "msg_insert_unblocked_parties" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id AND public.can_send_to_conversation(conversation_id)
  );

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conversation public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conversation FROM public.conversations WHERE id = NEW.conversation_id;
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT participant_id, 'message', 'New message', 'You have a new message on GariLink',
         jsonb_build_object('conversation_id', NEW.conversation_id)
  FROM unnest(ARRAY[v_conversation.driver_id, v_conversation.owner_id, v_conversation.admin_id]) participant_id
  WHERE participant_id IS NOT NULL AND participant_id <> NEW.sender_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_new_message ON public.messages;
CREATE TRIGGER trg_notify_new_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_message();

CREATE OR REPLACE FUNCTION public.protect_message_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Only the message read state may be updated';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_message_content ON public.messages;
CREATE TRIGGER trg_protect_message_content
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_message_content();

-- Owners may edit their uploads, but cannot approve their own moderation data.
CREATE OR REPLACE FUNCTION public.protect_document_moderation_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin()
    AND (
      NEW.verified IS DISTINCT FROM OLD.verified
      OR NEW.rejected IS DISTINCT FROM OLD.rejected
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
    )
    AND NOT (
      NEW.file_url IS DISTINCT FROM OLD.file_url
      AND NEW.verified = false
      AND NEW.rejected = false
      AND NEW.rejection_reason IS NULL
    )
  THEN
    RAISE EXCEPTION 'Document moderation fields are administrator-only';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_document_moderation_fields ON public.documents;
CREATE TRIGGER trg_protect_document_moderation_fields
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.protect_document_moderation_fields();

CREATE OR REPLACE FUNCTION public.protect_platform_history_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin()
    AND NEW.approved IS DISTINCT FROM OLD.approved
    AND NOT (
      NEW.proof_url IS DISTINCT FROM OLD.proof_url
      AND NEW.approved = false
    )
  THEN
    RAISE EXCEPTION 'Platform-history approval is administrator-only';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_platform_history_approval ON public.driver_platform_history;
CREATE TRIGGER trg_protect_platform_history_approval
  BEFORE UPDATE ON public.driver_platform_history
  FOR EACH ROW EXECUTE FUNCTION public.protect_platform_history_approval();

CREATE OR REPLACE FUNCTION public.protect_vehicle_featured()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() AND NEW.featured IS DISTINCT FROM OLD.featured THEN
    RAISE EXCEPTION 'Featured status is administrator-only';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_vehicle_featured ON public.vehicles;
CREATE TRIGGER trg_protect_vehicle_featured
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.protect_vehicle_featured();

-- ---------- Reviews: counterpart validation, uniqueness, aggregates ----------
DELETE FROM public.reviews a
USING public.reviews b
WHERE a.application_id = b.application_id
  AND a.reviewer_id = b.reviewer_id
  AND a.created_at > b.created_at;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_one_per_party UNIQUE (application_id, reviewer_id);

DROP POLICY IF EXISTS "reviews_insert_reviewer" ON public.reviews;

CREATE OR REPLACE FUNCTION public.submit_review(
  p_application_id uuid,
  p_rating int,
  p_content text DEFAULT NULL
)
RETURNS public.reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.applications%ROWTYPE;
  v_reviewee uuid;
  v_review public.reviews%ROWTYPE;
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Rating must be between 1 and 5'; END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND OR v_app.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'A completed match is required to leave a review';
  END IF;
  IF auth.uid() = v_app.driver_id THEN v_reviewee := v_app.owner_id;
  ELSIF auth.uid() = v_app.owner_id THEN v_reviewee := v_app.driver_id;
  ELSE RAISE EXCEPTION 'Not an application participant';
  END IF;

  INSERT INTO public.reviews (application_id, reviewer_id, reviewee_id, rating, content)
  VALUES (v_app.id, auth.uid(), v_reviewee, p_rating, nullif(trim(p_content), ''))
  RETURNING * INTO v_review;

  PERFORM set_config('app.profile_system_update', 'on', true);
  UPDATE public.profiles p SET
    rating = stats.average_rating,
    rating_count = stats.review_count,
    contracts_completed = (
      SELECT count(*) FROM public.applications a
      WHERE a.status = 'completed' AND (a.driver_id = p.id OR a.owner_id = p.id)
    )
  FROM (
    SELECT round(avg(rating)::numeric, 1) average_rating, count(*)::int review_count
    FROM public.reviews WHERE reviewee_id = v_reviewee
  ) stats
  WHERE p.id = v_reviewee;
  RETURN v_review;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_review(uuid, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, int, text) TO authenticated;

-- Admin-only notification helper for moderation events.
CREATE OR REPLACE FUNCTION public.admin_notify_user(
  p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p_user_id, p_type, p_title, p_body, p_data);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_notify_user(uuid, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notify_user(uuid, text, text, text, jsonb) TO authenticated;
