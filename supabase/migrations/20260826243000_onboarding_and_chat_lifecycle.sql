-- Required driver introduction, reconnectable relationships, preserved read-only
-- chat history, and explicit multi-admin participation in member conversations.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Existing members pre-date the required introduction step. Do not unexpectedly
-- hide them; only newly-created drivers start incomplete.
UPDATE public.profiles SET onboarding_completed = true;
GRANT SELECT (onboarding_completed) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  v_role := CASE WHEN NEW.raw_user_meta_data ->> 'role' IN ('driver', 'owner')
    THEN NEW.raw_user_meta_data ->> 'role' ELSE 'driver' END;
  INSERT INTO public.profiles (id, role, full_name, phone, email, location, onboarding_completed)
  VALUES (
    NEW.id, v_role, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'phone', ''), NEW.email,
    NULLIF(trim(NEW.raw_user_meta_data ->> 'location'), ''), v_role <> 'driver'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_driver_about_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'driver' AND NEW.onboarding_completed
     AND (OLD.onboarding_completed IS DISTINCT FROM true)
     AND (
       length(trim(NEW.full_name)) < 2 OR
       length(trim(COALESCE(NEW.bio, ''))) < 20 OR
       length(trim(COALESCE(NEW.location, ''))) < 2 OR
       NEW.age IS NULL OR NEW.age < 18 OR NEW.age > 85 OR
       COALESCE(array_length(NEW.languages, 1), 0) = 0 OR
       NEW.driving_experience_years IS NULL OR NEW.driving_experience_years < 0
     )
  THEN
    RAISE EXCEPTION 'Complete your name, location, age, bio, languages, and driving experience before publishing your profile';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_driver_about_completion ON public.profiles;
CREATE TRIGGER trg_validate_driver_about_completion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_driver_about_completion();

DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
CREATE POLICY "profiles_read_all" ON public.profiles
  FOR SELECT TO authenticated USING (
    role <> 'driver' OR onboarding_completed OR id = auth.uid() OR public.is_admin()
  );

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.conversations c
SET closed_at = COALESCE(c.closed_at, cn.updated_at), closed_by = COALESCE(c.closed_by, cn.requester_id)
FROM public.connections cn
WHERE c.connection_id = cn.id AND cn.status = 'ended' AND c.closed_at IS NULL;

UPDATE public.conversations c
SET closed_at = COALESCE(c.closed_at, a.updated_at), closed_by = COALESCE(c.closed_by, a.owner_id)
FROM public.applications a
WHERE c.application_id = a.id AND a.status = 'completed' AND c.closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.conversation_admins (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, admin_id)
);
ALTER TABLE public.conversation_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversation_admins_read" ON public.conversation_admins;
CREATE POLICY "conversation_admins_read" ON public.conversation_admins
  FOR SELECT TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND auth.uid() IN (c.driver_id, c.owner_id)
    )
  );

DROP POLICY IF EXISTS "conversation_admins_join" ON public.conversation_admins;
CREATE POLICY "conversation_admins_join" ON public.conversation_admins
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND admin_id = auth.uid());

-- Allow a fresh request after a previous connection was ended/rejected while
-- still preventing two simultaneous requests for the same pair.
ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_requester_id_recipient_id_key;
DROP INDEX IF EXISTS public.connections_one_active_pair;
CREATE UNIQUE INDEX connections_one_active_pair
  ON public.connections (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))
  WHERE status IN ('pending', 'accepted');

DROP POLICY IF EXISTS "conn_insert_requester" ON public.connections;

CREATE OR REPLACE FUNCTION public.request_connection(
  p_recipient_id uuid,
  p_message text DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL
)
RETURNS public.connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requester public.profiles%ROWTYPE;
  v_recipient public.profiles%ROWTYPE;
  v_connection public.connections%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF auth.uid() = p_recipient_id THEN RAISE EXCEPTION 'You cannot connect to yourself'; END IF;
  SELECT * INTO v_requester FROM public.profiles WHERE id = auth.uid();
  SELECT * INTO v_recipient FROM public.profiles WHERE id = p_recipient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_requester.is_suspended OR v_recipient.is_suspended THEN RAISE EXCEPTION 'Suspended accounts cannot create connections'; END IF;
  IF v_requester.role = v_recipient.role OR v_requester.role NOT IN ('driver','owner') OR v_recipient.role NOT IN ('driver','owner') THEN
    RAISE EXCEPTION 'Connections must pair one driver with one car owner';
  END IF;
  IF (v_requester.role = 'driver' AND NOT v_requester.onboarding_completed)
     OR (v_recipient.role = 'driver' AND NOT v_recipient.onboarding_completed) THEN
    RAISE EXCEPTION 'The driver must complete their About You profile before connecting';
  END IF;
  IF v_requester.availability <> 'available' OR v_recipient.availability <> 'available' THEN
    RAISE EXCEPTION 'One of these members is currently unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.connections
    WHERE status IN ('pending','accepted')
      AND ((requester_id = auth.uid() AND recipient_id = p_recipient_id)
        OR (requester_id = p_recipient_id AND recipient_id = auth.uid()))
  ) THEN RAISE EXCEPTION 'A connection with this member is already pending or active'; END IF;

  INSERT INTO public.connections (requester_id, recipient_id, vehicle_id, message, status)
  VALUES (auth.uid(), p_recipient_id, p_vehicle_id, NULLIF(trim(p_message), ''), 'pending')
  RETURNING * INTO v_connection;
  RETURN v_connection;
END;
$$;
REVOKE ALL ON FUNCTION public.request_connection(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_connection(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_member_availability(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles p
  SET availability = CASE WHEN
    EXISTS (SELECT 1 FROM public.connections c WHERE c.status = 'accepted' AND p.id IN (c.requester_id, c.recipient_id))
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.status = 'accepted' AND p.id IN (a.driver_id, a.owner_id))
    THEN 'unavailable' ELSE 'available' END
  WHERE p.id = p_user_id AND p.role IN ('driver','owner');
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_member_availability(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.mark_driver_unavailable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    UPDATE public.profiles SET availability = 'unavailable'
    WHERE id IN (NEW.requester_id, NEW.recipient_id) AND role IN ('driver','owner');
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_connection(p_connection_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conn public.connections%ROWTYPE; v_other uuid; v_name text;
BEGIN
  SELECT * INTO v_conn FROM public.connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;
  IF auth.uid() NOT IN (v_conn.requester_id, v_conn.recipient_id) AND NOT public.is_admin() THEN RAISE EXCEPTION 'Not a connection participant'; END IF;
  IF v_conn.status <> 'accepted' THEN RAISE EXCEPTION 'Only accepted connections can be ended'; END IF;
  UPDATE public.connections SET status = 'ended' WHERE id = v_conn.id;
  UPDATE public.conversations SET closed_at = now(), closed_by = auth.uid() WHERE connection_id = v_conn.id AND closed_at IS NULL;
  v_other := CASE WHEN auth.uid() = v_conn.requester_id THEN v_conn.recipient_id ELSE v_conn.requester_id END;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (v_other, 'connection_ended', 'Connection ended', COALESCE(v_name, 'The other member') || ' ended the connection. The chat is saved as read-only history; send a new connection request to chat again.', jsonb_build_object('connection_id', v_conn.id));
  PERFORM public.refresh_member_availability(v_conn.requester_id);
  PERFORM public.refresh_member_availability(v_conn.recipient_id);
END;
$$;
REVOKE ALL ON FUNCTION public.end_connection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_connection(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_availability(p_available boolean)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conn record; v_app record; v_count integer := 0; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT p_available THEN
    UPDATE public.profiles SET availability = 'unavailable' WHERE id = auth.uid() AND role IN ('driver','owner');
    RETURN 0;
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  FOR v_conn IN SELECT * FROM public.connections WHERE status = 'accepted' AND auth.uid() IN (requester_id, recipient_id) FOR UPDATE LOOP
    UPDATE public.connections SET status = 'ended' WHERE id = v_conn.id;
    UPDATE public.conversations SET closed_at = now(), closed_by = auth.uid() WHERE connection_id = v_conn.id AND closed_at IS NULL;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (CASE WHEN auth.uid() = v_conn.requester_id THEN v_conn.recipient_id ELSE v_conn.requester_id END,
      'connection_ended', 'Connection ended', COALESCE(v_name, 'The other member') || ' became available for new connections and ended your active connection. The chat remains saved as read-only history.', jsonb_build_object('connection_id', v_conn.id));
    PERFORM public.refresh_member_availability(v_conn.requester_id);
    PERFORM public.refresh_member_availability(v_conn.recipient_id);
    v_count := v_count + 1;
  END LOOP;
  FOR v_app IN SELECT * FROM public.applications WHERE status = 'accepted' AND auth.uid() IN (driver_id, owner_id) FOR UPDATE LOOP
    UPDATE public.applications SET status = 'completed' WHERE id = v_app.id;
    UPDATE public.conversations SET closed_at = now(), closed_by = auth.uid() WHERE application_id = v_app.id AND closed_at IS NULL;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (CASE WHEN auth.uid() = v_app.driver_id THEN v_app.owner_id ELSE v_app.driver_id END,
      'connection_ended', 'Connection ended', COALESCE(v_name, 'The other member') || ' became available for new connections. The chat remains saved as read-only history.', jsonb_build_object('application_id', v_app.id));
    PERFORM public.refresh_member_availability(v_app.driver_id);
    PERFORM public.refresh_member_availability(v_app.owner_id);
    v_count := v_count + 1;
  END LOOP;
  PERFORM public.refresh_member_availability(auth.uid());
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_availability(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_availability(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_application(p_application_id uuid, p_status text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_app public.applications%ROWTYPE; v_conversation_id uuid;
BEGIN
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF p_status IN ('accepted', 'rejected', 'completed') THEN
    IF auth.uid() <> v_app.owner_id AND NOT public.is_admin() THEN RAISE EXCEPTION 'Only the vehicle owner can perform this transition'; END IF;
  ELSIF p_status = 'withdrawn' THEN
    IF auth.uid() <> v_app.driver_id THEN RAISE EXCEPTION 'Only the driver can withdraw an application'; END IF;
  ELSE RAISE EXCEPTION 'Invalid application status'; END IF;
  IF v_app.status <> 'pending' AND NOT (v_app.status = 'accepted' AND p_status = 'completed') THEN
    RAISE EXCEPTION 'Invalid application transition from % to %', v_app.status, p_status;
  END IF;

  UPDATE public.applications SET status = p_status WHERE id = v_app.id;
  IF p_status = 'accepted' THEN
    UPDATE public.profiles SET availability = 'unavailable' WHERE id IN (v_app.driver_id, v_app.owner_id);
    INSERT INTO public.conversations (application_id, vehicle_id, driver_id, owner_id)
    VALUES (v_app.id, v_app.vehicle_id, v_app.driver_id, v_app.owner_id)
    ON CONFLICT (application_id) DO UPDATE SET application_id = EXCLUDED.application_id, closed_at = NULL, closed_by = NULL
    RETURNING id INTO v_conversation_id;
  ELSIF p_status = 'completed' THEN
    UPDATE public.conversations SET closed_at = now(), closed_by = auth.uid() WHERE application_id = v_app.id AND closed_at IS NULL;
    PERFORM public.refresh_member_availability(v_app.driver_id);
    PERFORM public.refresh_member_availability(v_app.owner_id);
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (v_app.driver_id, 'application_' || p_status, 'Application ' || p_status,
    CASE WHEN p_status = 'completed' THEN 'The arrangement was completed. Your chat remains saved as read-only history.' ELSE 'Your application was ' || p_status || '.' END,
    jsonb_build_object('application_id', v_app.id, 'conversation_id', v_conversation_id));
  RETURN v_conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_application(uuid, text) TO authenticated;

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
      AND (
        (c.closed_at IS NULL AND auth.uid() IN (c.driver_id, c.owner_id, c.admin_id))
        OR EXISTS (SELECT 1 FROM public.conversation_admins ca WHERE ca.conversation_id = c.id AND ca.admin_id = auth.uid())
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b
        WHERE (b.blocker_id = auth.uid() AND b.blocked_id IN (c.driver_id, c.owner_id, c.admin_id))
           OR (b.blocked_id = auth.uid() AND b.blocker_id IN (c.driver_id, c.owner_id, c.admin_id))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_send_to_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_to_conversation(uuid) TO authenticated;

DROP POLICY IF EXISTS "msg_update_read_flag" ON public.messages;
CREATE POLICY "msg_update_read_flag" ON public.messages
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND auth.uid() IN (c.driver_id, c.owner_id, c.admin_id))
    OR EXISTS (SELECT 1 FROM public.conversation_admins ca WHERE ca.conversation_id = messages.conversation_id AND ca.admin_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND auth.uid() IN (c.driver_id, c.owner_id, c.admin_id))
    OR EXISTS (SELECT 1 FROM public.conversation_admins ca WHERE ca.conversation_id = messages.conversation_id AND ca.admin_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.admin_join_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inserted integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = p_conversation_id) THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  INSERT INTO public.conversation_admins (conversation_id, admin_id) VALUES (p_conversation_id, auth.uid()) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted > 0 THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, type)
    VALUES (p_conversation_id, auth.uid(), 'An administrator joined this conversation to provide support and help resolve concerns.', 'system');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_join_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_join_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  SELECT DISTINCT recipient_id, 'message', 'New message', 'You have a new message on GariLink', jsonb_build_object('conversation_id', NEW.conversation_id)
  FROM (
    SELECT unnest(ARRAY[c.driver_id, c.owner_id, c.admin_id]) AS recipient_id FROM public.conversations c WHERE c.id = NEW.conversation_id
    UNION
    SELECT ca.admin_id FROM public.conversation_admins ca WHERE ca.conversation_id = NEW.conversation_id
  ) recipients
  WHERE recipient_id IS NOT NULL AND recipient_id <> NEW.sender_id;
  RETURN NEW;
END;
$$;
