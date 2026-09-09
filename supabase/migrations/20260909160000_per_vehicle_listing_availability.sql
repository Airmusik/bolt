-- Capacity belongs to a driver and a particular car, never to the entire owner.
CREATE OR REPLACE FUNCTION public.refresh_member_availability(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles p SET availability = CASE
    WHEN p.role = 'owner' AND EXISTS (
      SELECT 1 FROM public.vehicles v WHERE v.owner_id = p.id AND v.status = 'active'
      AND v.availability = 'available' AND v.approval_status = 'approved'
      AND v.deleted_at IS NULL AND v.document_listing_visibility = 'public'
    ) THEN 'available'
    WHEN EXISTS (SELECT 1 FROM public.connections c WHERE c.status = 'accepted' AND p.id IN (c.requester_id,c.recipient_id))
      OR EXISTS (SELECT 1 FROM public.applications a WHERE a.status = 'accepted' AND p.id IN (a.driver_id,a.owner_id)) THEN 'busy'
    WHEN p.role = 'owner' THEN 'unavailable'
    ELSE 'available' END
  WHERE p.id = p_user_id AND p.role IN ('driver','owner');
END $$;

-- Runs for both RPC and direct inserts. Profile locks serialize requests and
-- acceptance across both relationship tables; the car lock also serializes pausing.
CREATE OR REPLACE FUNCTION public.guard_vehicle_connection_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_driver uuid; v_owner uuid; v_car public.vehicles%ROWTYPE;
  v_driver_profile public.profiles%ROWTYPE;
BEGIN
  IF NEW.status NOT IN ('pending','accepted') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'connections' THEN
      IF (NEW.status,NEW.vehicle_id,NEW.requester_id,NEW.recipient_id) IS NOT DISTINCT FROM
         (OLD.status,OLD.vehicle_id,OLD.requester_id,OLD.recipient_id) THEN RETURN NEW; END IF;
    ELSE
      IF (NEW.status,NEW.vehicle_id,NEW.driver_id,NEW.owner_id) IS NOT DISTINCT FROM
         (OLD.status,OLD.vehicle_id,OLD.driver_id,OLD.owner_id) THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'connections' THEN
    SELECT id INTO v_driver FROM public.profiles WHERE id IN (NEW.requester_id,NEW.recipient_id) AND role = 'driver';
    SELECT id INTO v_owner FROM public.profiles WHERE id IN (NEW.requester_id,NEW.recipient_id) AND role = 'owner';
  ELSE v_driver := NEW.driver_id; v_owner := NEW.owner_id;
  END IF;
  IF v_driver IS NULL OR v_owner IS NULL OR v_driver = v_owner THEN
    RAISE EXCEPTION 'Connections must pair one driver with one car owner';
  END IF;
  PERFORM 1 FROM public.profiles WHERE id IN (v_driver,v_owner) ORDER BY id FOR UPDATE;
  SELECT * INTO v_driver_profile FROM public.profiles WHERE id = v_driver AND role = 'driver';
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_owner AND role = 'owner' AND NOT is_suspended)
    OR v_driver_profile.is_suspended THEN RAISE EXCEPTION 'These accounts cannot create connections'; END IF;
  IF NOT v_driver_profile.onboarding_completed THEN RAISE EXCEPTION 'The driver must complete their About You profile before connecting'; END IF;
  PERFORM public.require_approved_driver_history(v_driver);
  IF EXISTS (SELECT 1 FROM public.connections c WHERE c.status = 'accepted'
    AND v_driver IN (c.requester_id,c.recipient_id) AND (TG_TABLE_NAME <> 'connections' OR c.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.status = 'accepted' AND a.driver_id = v_driver
    AND (TG_TABLE_NAME <> 'applications' OR a.id <> NEW.id)) THEN
    RAISE EXCEPTION 'This driver is already on a connection. End it before connecting to another car.';
  END IF;
  IF v_driver_profile.availability <> 'available' THEN RAISE EXCEPTION 'This driver is currently unavailable'; END IF;
  IF NEW.vehicle_id IS NULL THEN RAISE EXCEPTION 'Choose a live car before sending a connection request. For an older request without a car, cancel it and send a new one.'; END IF;
  SELECT * INTO v_car FROM public.vehicles WHERE id = NEW.vehicle_id FOR UPDATE;
  IF NOT FOUND OR v_car.owner_id <> v_owner THEN RAISE EXCEPTION 'The selected car must belong to this owner'; END IF;
  IF EXISTS (SELECT 1 FROM public.connections c WHERE c.status = 'accepted' AND c.vehicle_id = v_car.id
    AND (TG_TABLE_NAME <> 'connections' OR c.id <> NEW.id))
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.status = 'accepted' AND a.vehicle_id = v_car.id
    AND (TG_TABLE_NAME <> 'applications' OR a.id <> NEW.id)) THEN
    RAISE EXCEPTION 'This car is already on a connection. Choose another live car.';
  END IF;
  IF v_car.status <> 'active' OR v_car.availability <> 'available' OR v_car.approval_status <> 'approved'
    OR v_car.deleted_at IS NOT NULL OR v_car.document_listing_visibility <> 'public' THEN
    RAISE EXCEPTION 'This car is not live. Its owner must make the approved listing live before connecting.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_vehicle_connection_capacity ON public.connections;
CREATE TRIGGER a_vehicle_connection_capacity BEFORE INSERT OR UPDATE ON public.connections
FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_connection_capacity();
DROP TRIGGER IF EXISTS a_vehicle_application_capacity ON public.applications;
CREATE TRIGGER a_vehicle_application_capacity BEFORE INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_connection_capacity();

-- Synchronize the legacy availability field with live status, including old clients.
-- Approval still comes exclusively from the existing admin-approval guard.
CREATE OR REPLACE FUNCTION public.guard_vehicle_live_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.availability = 'taken' THEN NEW.status := 'closed'; END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.availability := CASE WHEN NEW.status = 'active' THEN 'available' ELSE 'taken' END;
  ELSIF NEW.availability IS DISTINCT FROM OLD.availability THEN
    NEW.status := CASE WHEN NEW.availability = 'available' THEN 'active' ELSE 'closed' END;
  END IF;
  IF NEW.status = 'active' AND NEW.approval_status = 'approved' AND (
    EXISTS (SELECT 1 FROM public.connections c WHERE c.vehicle_id = NEW.id AND c.status = 'accepted')
    OR EXISTS (SELECT 1 FROM public.applications a WHERE a.vehicle_id = NEW.id AND a.status = 'accepted')
  ) THEN RAISE EXCEPTION 'End this car''s active connection before setting its listing live.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_vehicle_live_status ON public.vehicles;
CREATE TRIGGER zz_vehicle_live_status BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.guard_vehicle_live_status();

CREATE OR REPLACE FUNCTION public.reserve_connected_vehicle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.status = 'accepted' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'accepted') THEN
    -- Never republish automatically when a connection ends.
    UPDATE public.vehicles SET status = 'closed',availability = 'taken' WHERE id = NEW.vehicle_id RETURNING owner_id INTO v_owner;
    PERFORM public.refresh_member_availability(v_owner);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reserve_connected_vehicle ON public.connections;
CREATE TRIGGER reserve_connected_vehicle AFTER INSERT OR UPDATE OF status ON public.connections
FOR EACH ROW EXECUTE FUNCTION public.reserve_connected_vehicle();
DROP TRIGGER IF EXISTS reserve_connected_vehicle ON public.applications;
CREATE TRIGGER reserve_connected_vehicle AFTER INSERT OR UPDATE OF status ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.reserve_connected_vehicle();

CREATE OR REPLACE FUNCTION public.set_my_vehicle_live(p_vehicle_id uuid,p_live boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_car public.vehicles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_live IS NULL THEN RAISE EXCEPTION 'Sign in and choose a listing status'; END IF;
  PERFORM 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner' AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An active car owner account is required'; END IF;
  SELECT * INTO v_car FROM public.vehicles WHERE id = p_vehicle_id AND owner_id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR v_car.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Listing not found'; END IF;
  IF p_live AND v_car.approval_status <> 'approved' THEN RAISE EXCEPTION 'Wait for admin approval before setting this listing live'; END IF;
  IF p_live AND v_car.document_listing_visibility <> 'public' THEN RAISE EXCEPTION 'Contact support to restore this listing before making it live'; END IF;
  UPDATE public.vehicles SET status = CASE WHEN p_live THEN 'active' ELSE 'closed' END,
    availability = CASE WHEN p_live THEN 'available' ELSE 'taken' END WHERE id = v_car.id;
  PERFORM public.refresh_member_availability(auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.set_my_vehicle_live(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_my_vehicle_live(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_connection_before_history_gate(p_recipient_id uuid, p_message text DEFAULT NULL::text, p_vehicle_id uuid DEFAULT NULL::uuid)
 RETURNS connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF (v_requester.role = 'driver' AND v_requester.availability <> 'available')
     OR (v_recipient.role = 'driver' AND v_recipient.availability <> 'available') THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.transition_connection(p_connection_id uuid, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_conn public.connections%ROWTYPE;
  v_requester_role text;
  v_recipient_role text;
  v_driver_id uuid;
  v_owner_id uuid;
  v_conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
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
    WHERE id = v_driver_id;

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
      THEN 'Your connection request was accepted. The driver and this car are now on a connection. The owner can still receive requests for their other live cars.'
      ELSE 'Your connection request was ' || p_status || '.' END,
    jsonb_build_object('connection_id', v_conn.id, 'conversation_id', v_conversation_id)
  );
  RETURN v_conversation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_application(p_application_id uuid, p_status text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_app public.applications%ROWTYPE; v_conversation_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
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

  UPDATE public.applications SET status = p_status WHERE id = v_app.id;
  IF p_status = 'accepted' THEN
    UPDATE public.profiles SET availability = 'busy' WHERE id = v_app.driver_id;
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
      WHEN p_status = 'accepted' THEN 'Your application was accepted. The driver and this car are now on a connection. The owner can still receive requests for their other live cars.'
      WHEN p_status = 'completed' THEN 'The arrangement was completed. Your chat remains saved as read-only history.'
      ELSE 'Your application was ' || p_status || '.'
    END,
    jsonb_build_object('application_id', v_app.id, 'conversation_id', v_conversation_id)
  );
  RETURN v_conversation_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_driver_unavailable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    UPDATE public.profiles SET availability = 'busy'
    WHERE id IN (NEW.requester_id, NEW.recipient_id) AND role = 'driver';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_availability_before_history_gate(p_available boolean)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_conn record; v_app record; v_count integer := 0; v_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner') THEN
    RAISE EXCEPTION 'Manage each car using Set live or Set not live in My vehicles. Other connections will not be changed.';
  END IF;
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
$function$;

-- Trigger helpers and legacy inner RPCs must not be callable by a member directly.
REVOKE ALL ON FUNCTION public.guard_vehicle_connection_capacity(),public.guard_vehicle_live_status(),public.reserve_connected_vehicle() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.request_connection_before_history_gate(uuid,text,uuid),public.set_my_availability_before_history_gate(boolean),public.refresh_member_availability(uuid),public.mark_driver_unavailable() FROM PUBLIC,anon,authenticated;

-- Existing booked or manually-taken cars must not stay advertised as live.
UPDATE public.vehicles v SET status = 'closed',availability = 'taken'
WHERE v.deleted_at IS NULL AND (v.availability = 'taken'
  OR EXISTS (SELECT 1 FROM public.connections c WHERE c.vehicle_id = v.id AND c.status = 'accepted')
  OR EXISTS (SELECT 1 FROM public.applications a WHERE a.vehicle_id = v.id AND a.status = 'accepted'));
DO $$ DECLARE member record; BEGIN
  FOR member IN SELECT id FROM public.profiles WHERE role = 'owner' LOOP
    PERFORM public.refresh_member_availability(member.id);
  END LOOP;
END $$;

