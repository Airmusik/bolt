-- Make active relationships explicit, prevent overlapping accepted connections,
-- keep owner/vehicle locations aligned, and leave approved listings live when
-- only their text details change. New photos continue through photo moderation.

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
    THEN 'busy' ELSE 'available' END
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
    UPDATE public.profiles SET availability = 'busy'
    WHERE id IN (NEW.requester_id, NEW.recipient_id) AND role IN ('driver','owner');
  END IF;
  RETURN NEW;
END;
$$;

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

  -- Serialize acceptances involving either participant so two simultaneous
  -- clicks cannot create overlapping active connections.
  IF p_status = 'accepted' THEN
    PERFORM 1 FROM public.profiles
    WHERE id IN (v_conn.requester_id, v_conn.recipient_id)
    ORDER BY id FOR UPDATE;
  END IF;

  IF p_status = 'accepted' AND (
    EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.status = 'accepted'
        AND (v_conn.requester_id IN (c.requester_id, c.recipient_id)
          OR v_conn.recipient_id IN (c.requester_id, c.recipient_id))
    ) OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.status = 'accepted'
        AND (v_conn.requester_id IN (a.driver_id, a.owner_id)
          OR v_conn.recipient_id IN (a.driver_id, a.owner_id))
    )
  ) THEN
    RAISE EXCEPTION 'One of these members is already on an active connection. End it before accepting another.';
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

    UPDATE public.profiles SET availability = 'busy'
    WHERE id IN (v_conn.requester_id, v_conn.recipient_id);

    INSERT INTO public.conversations (connection_id, vehicle_id, driver_id, owner_id)
    VALUES (v_conn.id, v_conn.vehicle_id, v_driver_id, v_owner_id)
    ON CONFLICT (connection_id) DO UPDATE
      SET connection_id = EXCLUDED.connection_id, closed_at = NULL, closed_by = NULL
    RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    CASE WHEN auth.uid() = v_conn.requester_id THEN v_conn.recipient_id ELSE v_conn.requester_id END,
    'connection_' || p_status,
    'Connection ' || p_status,
    CASE WHEN p_status = 'accepted'
      THEN 'Your connection request was accepted. Both profiles now show currently on a connection, and neither member can accept another until this connection ends.'
      ELSE 'Your connection request was ' || p_status || '.' END,
    jsonb_build_object('connection_id', v_conn.id, 'conversation_id', v_conversation_id)
  );
  RETURN v_conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_connection(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_connection(uuid, text) TO authenticated;

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

  IF p_status = 'accepted' THEN
    PERFORM 1 FROM public.profiles
    WHERE id IN (v_app.driver_id, v_app.owner_id)
    ORDER BY id FOR UPDATE;
  END IF;

  IF p_status = 'accepted' AND (
    EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.status = 'accepted'
        AND (v_app.driver_id IN (c.requester_id, c.recipient_id)
          OR v_app.owner_id IN (c.requester_id, c.recipient_id))
    ) OR EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.status = 'accepted'
        AND a.id <> v_app.id
        AND (v_app.driver_id IN (a.driver_id, a.owner_id)
          OR v_app.owner_id IN (a.driver_id, a.owner_id))
    )
  ) THEN
    RAISE EXCEPTION 'One of these members is already on an active connection. End it before accepting another.';
  END IF;

  UPDATE public.applications SET status = p_status WHERE id = v_app.id;
  IF p_status = 'accepted' THEN
    UPDATE public.profiles SET availability = 'busy' WHERE id IN (v_app.driver_id, v_app.owner_id);
    INSERT INTO public.conversations (application_id, vehicle_id, driver_id, owner_id)
    VALUES (v_app.id, v_app.vehicle_id, v_app.driver_id, v_app.owner_id)
    ON CONFLICT (application_id) DO UPDATE
      SET application_id = EXCLUDED.application_id, closed_at = NULL, closed_by = NULL
    RETURNING id INTO v_conversation_id;
  ELSIF p_status = 'completed' THEN
    UPDATE public.conversations SET closed_at = now(), closed_by = auth.uid()
    WHERE application_id = v_app.id AND closed_at IS NULL;
    PERFORM public.refresh_member_availability(v_app.driver_id);
    PERFORM public.refresh_member_availability(v_app.owner_id);
  END IF;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_app.driver_id,
    'application_' || p_status,
    'Application ' || p_status,
    CASE
      WHEN p_status = 'accepted' THEN 'Your application was accepted. Both profiles now show currently on a connection, and neither member can accept another until this arrangement ends.'
      WHEN p_status = 'completed' THEN 'The arrangement was completed. Your chat remains saved as read-only history.'
      ELSE 'Your application was ' || p_status || '.'
    END,
    jsonb_build_object('application_id', v_app.id, 'conversation_id', v_conversation_id)
  );
  RETURN v_conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_application(uuid, text) TO authenticated;

-- Existing active members should immediately show the new public label.
UPDATE public.profiles p
SET availability = 'busy'
WHERE p.role IN ('driver','owner') AND (
  EXISTS (SELECT 1 FROM public.connections c WHERE c.status = 'accepted' AND p.id IN (c.requester_id, c.recipient_id))
  OR EXISTS (SELECT 1 FROM public.applications a WHERE a.status = 'accepted' AND p.id IN (a.driver_id, a.owner_id))
);

CREATE OR REPLACE FUNCTION public.protect_vehicle_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending';
    NEW.approval_note := NULL;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  -- Owner text edits do not unpublish an approved listing. Photo rows have
  -- independent moderation fields, so every new/replaced image remains pending.
  NEW.approval_status := OLD.approval_status;
  NEW.approval_note := OLD.approval_note;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_owner_location_from_vehicle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL AND length(trim(COALESCE(NEW.location, ''))) >= 2 THEN
    UPDATE public.profiles
    SET location = trim(NEW.location)
    WHERE id = NEW.owner_id AND role = 'owner' AND location IS DISTINCT FROM trim(NEW.location);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_owner_location_from_vehicle ON public.vehicles;
CREATE TRIGGER trg_sync_owner_location_from_vehicle
  AFTER INSERT OR UPDATE OF location ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.sync_owner_location_from_vehicle();
