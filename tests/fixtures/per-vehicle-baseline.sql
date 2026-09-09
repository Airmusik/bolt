CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated,anon;
CREATE TABLE profiles (id uuid PRIMARY KEY,role text NOT NULL,full_name text DEFAULT 'Test member',is_suspended boolean DEFAULT false,onboarding_completed boolean DEFAULT true,availability text DEFAULT 'available',platform_history_approved boolean DEFAULT true);
CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin') $$;
CREATE FUNCTION require_approved_driver_history(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
  IF EXISTS(SELECT 1 FROM profiles WHERE id=p_id AND role='driver' AND NOT platform_history_approved) THEN RAISE EXCEPTION 'Submit platform history for admin approval'; END IF;
END $$;
CREATE TABLE vehicles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES profiles(id),status text DEFAULT 'active',availability text DEFAULT 'available',approval_status text DEFAULT 'approved',document_listing_visibility text DEFAULT 'public',deleted_at timestamptz);
CREATE TABLE connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requester_id uuid REFERENCES profiles(id),recipient_id uuid REFERENCES profiles(id),vehicle_id uuid REFERENCES vehicles(id),message text,status text DEFAULT 'pending');
CREATE TABLE applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_id uuid REFERENCES profiles(id),owner_id uuid REFERENCES profiles(id),vehicle_id uuid REFERENCES vehicles(id),status text DEFAULT 'pending');
CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid UNIQUE REFERENCES connections(id),application_id uuid UNIQUE REFERENCES applications(id),vehicle_id uuid,driver_id uuid,owner_id uuid,closed_at timestamptz,closed_by uuid);
CREATE TABLE notifications(user_id uuid,type text,title text,body text,data jsonb);
CREATE FUNCTION request_connection(p_recipient_id uuid,p_message text DEFAULT NULL,p_vehicle_id uuid DEFAULT NULL) RETURNS connections LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in before connecting'; END IF;
  PERFORM require_approved_driver_history(auth.uid());
  RETURN public.request_connection_before_history_gate(p_recipient_id,p_message,p_vehicle_id);
END $$;
CREATE FUNCTION set_my_availability(p_available boolean) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  PERFORM require_approved_driver_history(auth.uid()); RETURN set_my_availability_before_history_gate(p_available);
END $$;
CREATE OR REPLACE FUNCTION public.end_connection(p_connection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE FUNCTION mark_driver_unavailable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE TRIGGER trg_conn_mark_unavailable AFTER UPDATE ON connections FOR EACH ROW EXECUTE FUNCTION mark_driver_unavailable();
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
