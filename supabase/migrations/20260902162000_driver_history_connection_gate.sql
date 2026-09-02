ALTER TABLE public.profiles ADD COLUMN platform_history_approved boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN platform_history_submitted boolean NOT NULL DEFAULT false;
GRANT SELECT(platform_history_approved, platform_history_submitted) ON public.profiles TO anon, authenticated;

-- Derived from actual proof rows, never a client-controlled verification flag.
CREATE FUNCTION public.derive_driver_history_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.platform_history_approved := NEW.role = 'driver' AND EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id = NEW.id AND approved AND proof_url IS NOT NULL AND proof_url <> '' AND months_active > 0);
  NEW.platform_history_submitted := NEW.role = 'driver' AND EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id = NEW.id AND NOT approved AND proof_url IS NOT NULL AND proof_url <> '' AND months_active > 0);
  RETURN NEW;
END;
$$;
CREATE TRIGGER derive_driver_history_state BEFORE INSERT OR UPDATE OF platform_history_approved, platform_history_submitted, role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.derive_driver_history_state();
UPDATE public.profiles SET platform_history_approved = false, platform_history_submitted = false;

CREATE FUNCTION public.refresh_driver_history_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN UPDATE public.profiles SET platform_history_approved = false WHERE id = OLD.driver_id; END IF;
  IF TG_OP <> 'DELETE' THEN UPDATE public.profiles SET platform_history_approved = false WHERE id = NEW.driver_id; END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER refresh_driver_history_state AFTER INSERT OR UPDATE OR DELETE ON public.driver_platform_history FOR EACH ROW EXECUTE FUNCTION public.refresh_driver_history_state();

CREATE FUNCTION public.require_approved_driver_history(p_user_id uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF p.role = 'driver' AND NOT p.platform_history_approved THEN
    IF p.platform_history_submitted THEN RAISE EXCEPTION 'Your platform history is awaiting admin approval. Connections and availability unlock after approval.';
    ELSE RAISE EXCEPTION 'Submit your recent platform history for admin approval before connecting or changing availability.'; END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.require_approved_driver_history(uuid) FROM PUBLIC;

ALTER FUNCTION public.request_connection(uuid,text,uuid) RENAME TO request_connection_before_history_gate;
REVOKE ALL ON FUNCTION public.request_connection_before_history_gate(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.request_connection(p_recipient_id uuid, p_message text DEFAULT NULL, p_vehicle_id uuid DEFAULT NULL) RETURNS public.connections LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before connecting'; END IF;
  PERFORM public.require_approved_driver_history(auth.uid());
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_recipient_id AND role = 'driver' AND NOT platform_history_approved) THEN RAISE EXCEPTION 'This driver needs admin-approved platform history before you can connect'; END IF;
  IF p_vehicle_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id AND deleted_at IS NULL AND status = 'active' AND approval_status = 'approved') THEN RAISE EXCEPTION 'This listing is no longer available'; END IF;
  RETURN public.request_connection_before_history_gate(p_recipient_id,p_message,p_vehicle_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_connection(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_connection(uuid,text,uuid) TO authenticated;

ALTER FUNCTION public.set_my_availability(boolean) RENAME TO set_my_availability_before_history_gate;
REVOKE ALL ON FUNCTION public.set_my_availability_before_history_gate(boolean) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.set_my_availability(p_available boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_approved_driver_history(auth.uid());
  RETURN public.set_my_availability_before_history_gate(p_available);
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_availability(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_availability(boolean) TO authenticated;

CREATE FUNCTION public.gate_connection_driver_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('pending','accepted') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF TG_TABLE_NAME = 'connections' THEN
      PERFORM public.require_approved_driver_history(NEW.requester_id);
      PERFORM public.require_approved_driver_history(NEW.recipient_id);
    ELSE PERFORM public.require_approved_driver_history(NEW.driver_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gate_connection_driver_history BEFORE INSERT OR UPDATE OF status ON public.connections FOR EACH ROW EXECUTE FUNCTION public.gate_connection_driver_history();
CREATE TRIGGER gate_application_driver_history BEFORE INSERT OR UPDATE OF status ON public.applications FOR EACH ROW EXECUTE FUNCTION public.gate_connection_driver_history();

CREATE FUNCTION public.guard_driver_availability() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Direct member updates cannot bypass the RPC. Trusted connection-ending
  -- routines still run so existing chats can be ended safely after a re-review.
  IF current_user = 'authenticated' AND NOT public.is_admin() AND NEW.role = 'driver' AND NOT OLD.platform_history_approved AND NEW.availability IS DISTINCT FROM OLD.availability THEN
    RAISE EXCEPTION 'Availability is locked until admin approves your platform history';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_driver_availability BEFORE UPDATE OF availability ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_driver_availability();
NOTIFY pgrst, 'reload schema';
