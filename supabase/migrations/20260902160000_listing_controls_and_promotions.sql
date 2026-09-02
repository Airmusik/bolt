-- Listing removal preserves conversations, reports and application history.
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS vehicles_current_owner ON public.vehicles(owner_id) WHERE deleted_at IS NULL;
UPDATE public.site_settings SET value = '3' WHERE key = 'max_vehicles_per_owner';
INSERT INTO public.site_settings(key, value) VALUES ('max_vehicles_per_owner', '3') ON CONFLICT DO NOTHING;

CREATE TABLE public.owner_listing_limits (
  owner_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  max_listings integer NOT NULL CHECK (max_listings BETWEEN 3 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.owner_listing_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY listing_limits_read ON public.owner_listing_limits FOR SELECT TO authenticated USING (owner_id = auth.uid() OR public.is_admin());
CREATE POLICY listing_limits_admin ON public.owner_listing_limits FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_listing_limits TO authenticated;

CREATE FUNCTION public.my_listing_capacity() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('used', (SELECT count(*) FROM public.vehicles WHERE owner_id = auth.uid() AND deleted_at IS NULL),
    'limit', COALESCE((SELECT max_listings FROM public.owner_listing_limits WHERE owner_id = auth.uid()), 3));
$$;
REVOKE ALL ON FUNCTION public.my_listing_capacity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_listing_capacity() TO authenticated;

CREATE FUNCTION public.enforce_owner_listing_controls() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'A listing cannot be transferred to another account'; END IF;
    IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This listing has been deleted and cannot be edited'; END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at AND current_setting('app.vehicle_delete', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Use the delete listing action';
    END IF;
  ELSE
    NEW.deleted_at := NULL;
    -- Serialize creates for this owner, including simultaneous browser tabs.
    PERFORM pg_advisory_xact_lock(hashtextextended('owner-listings-' || NEW.owner_id::text, 0));
    SELECT COALESCE((SELECT max_listings FROM public.owner_listing_limits WHERE owner_id = NEW.owner_id), 3) INTO v_limit;
    IF (SELECT count(*) FROM public.vehicles WHERE owner_id = NEW.owner_id AND deleted_at IS NULL) >= v_limit THEN
      RAISE EXCEPTION 'Listing limit reached (% cars). Contact support to request more listings.', v_limit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_owner_listing_controls BEFORE INSERT OR UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.enforce_owner_listing_controls();
DROP POLICY IF EXISTS vehicles_delete_owner ON public.vehicles;
DROP POLICY IF EXISTS vehicles_read_visible ON public.vehicles;
CREATE POLICY vehicles_read_visible ON public.vehicles FOR SELECT TO anon, authenticated
  USING ((approval_status = 'approved' AND deleted_at IS NULL) OR owner_id = auth.uid() OR public.is_admin());

CREATE FUNCTION public.delete_my_vehicle(p_vehicle_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vehicles%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.vehicles WHERE id = p_vehicle_id FOR UPDATE;
  IF NOT FOUND OR v.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'You can only delete your own listing'; END IF;
  IF v.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.applications WHERE vehicle_id = v.id AND status = 'accepted')
    OR EXISTS (SELECT 1 FROM public.conversations c JOIN public.connections x ON x.id = c.connection_id WHERE c.vehicle_id = v.id AND x.status = 'accepted') THEN
    RAISE EXCEPTION 'End the active connection for this car before deleting its listing. Chat history will remain saved.';
  END IF;
  PERFORM set_config('app.vehicle_delete', 'on', true);
  UPDATE public.vehicles SET deleted_at = now(), status = 'closed' WHERE id = v.id;
  PERFORM set_config('app.vehicle_delete', 'off', true);
  UPDATE public.applications SET status = 'rejected' WHERE vehicle_id = v.id AND status = 'pending';
END;
$$;
REVOKE ALL ON FUNCTION public.delete_my_vehicle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_vehicle(uuid) TO authenticated;

CREATE FUNCTION public.prevent_application_to_deleted_vehicle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.vehicles%ROWTYPE;
BEGIN
  IF NEW.status IN ('pending', 'accepted') THEN
    SELECT * INTO v FROM public.vehicles WHERE id = NEW.vehicle_id FOR SHARE;
    IF NOT FOUND OR v.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'This listing is no longer available'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prevent_application_to_deleted_vehicle BEFORE INSERT OR UPDATE OF status ON public.applications FOR EACH ROW EXECUTE FUNCTION public.prevent_application_to_deleted_vehicle();

-- Private, caller-scoped explanation; reporter identities are never returned.
CREATE FUNCTION public.my_account_standing() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'rating', p.rating,
    'review_average', COALESCE((SELECT round(avg(rating)::numeric, 1) FROM public.reviews WHERE reviewee_id = auth.uid()), 5),
    'review_count', (SELECT count(*) FROM public.reviews WHERE reviewee_id = auth.uid()),
    'reports', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'reason', reason, 'description', description, 'status', status, 'created_at', created_at) ORDER BY created_at DESC) FROM public.reports WHERE reported_id = auth.uid() AND status IN ('reviewing','resolved')), '[]'::jsonb),
    'warnings', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'message', message, 'report_reason', report_reason, 'report_description', report_description, 'created_at', created_at) ORDER BY created_at DESC) FROM public.user_warnings WHERE user_id = auth.uid()), '[]'::jsonb)
  ) FROM public.profiles p WHERE p.id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.my_account_standing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_account_standing() TO authenticated;

-- Promotions use explicit manual payment verification, not automatic charging.
CREATE TABLE public.promotion_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  listing_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (listing_price >= 0),
  profile_price numeric(10,2) NOT NULL DEFAULT 0 CHECK (profile_price >= 0),
  duration_days integer NOT NULL DEFAULT 7 CHECK (duration_days BETWEEN 1 AND 365),
  payment_method text NOT NULL DEFAULT '',
  payment_instructions text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT 'Placement is labelled Sponsored. It does not guarantee applications or connections. Promotion starts after admin confirms payment. Contact support for cancellations or refunds.',
  CHECK (NOT enabled OR (listing_price > 0 AND profile_price > 0 AND length(trim(payment_method)) > 0 AND length(trim(payment_instructions)) > 0 AND length(trim(terms)) > 0)),
  CHECK (length(payment_method) <= 100 AND length(payment_instructions) <= 2000 AND length(terms) <= 2000)
);
INSERT INTO public.promotion_settings(id) VALUES (true);
ALTER TABLE public.promotion_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY promotion_settings_read ON public.promotion_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY promotion_settings_admin ON public.promotion_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.promotion_settings TO anon, authenticated;
GRANT UPDATE ON public.promotion_settings TO authenticated;

CREATE TABLE public.promotion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('listing','profile')),
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','pending','active','rejected','cancelled','expired')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  duration_days integer NOT NULL CHECK (duration_days BETWEEN 1 AND 365),
  payment_method text NOT NULL,
  payment_instructions text NOT NULL,
  terms text NOT NULL,
  payment_reference text,
  admin_note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  starts_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'listing' AND vehicle_id IS NOT NULL) OR (kind = 'profile' AND vehicle_id IS NULL))
);
CREATE INDEX promotion_active_targets ON public.promotion_requests(status, expires_at);
CREATE UNIQUE INDEX promotion_one_open_target ON public.promotion_requests(user_id, kind, COALESCE(vehicle_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE status IN ('awaiting_payment','pending','active');
CREATE UNIQUE INDEX promotion_payment_reference_unique ON public.promotion_requests(lower(payment_reference)) WHERE payment_reference IS NOT NULL;
ALTER TABLE public.promotion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY promotion_requests_private ON public.promotion_requests FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.promotion_requests TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.promotion_requests FROM anon, authenticated;

CREATE FUNCTION public.request_promotion(p_kind text, p_vehicle_id uuid DEFAULT NULL) RETURNS public.promotion_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.promotion_settings%ROWTYPE; p public.profiles%ROWTYPE; r public.promotion_requests%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND OR p.role NOT IN ('owner','driver') OR p.is_suspended THEN RAISE EXCEPTION 'A non-suspended member account is required'; END IF;
  SELECT * INTO s FROM public.promotion_settings WHERE id;
  IF NOT s.enabled THEN RAISE EXCEPTION 'Promotions are not currently available'; END IF;
  IF p_kind = 'listing' THEN
    IF NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id AND owner_id = p.id AND deleted_at IS NULL AND approval_status = 'approved' AND status = 'active') THEN RAISE EXCEPTION 'Only your live, approved listing can be promoted'; END IF;
  ELSIF p_kind = 'profile' THEN
    IF p_vehicle_id IS NOT NULL THEN RAISE EXCEPTION 'Choose a profile or a listing, not both'; END IF;
    IF p.role = 'driver' AND NOT p.onboarding_completed THEN RAISE EXCEPTION 'Complete About You before promoting your profile'; END IF;
    IF p.role = 'owner' AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE owner_id = p.id AND deleted_at IS NULL AND status = 'active' AND approval_status = 'approved') THEN RAISE EXCEPTION 'Publish an approved car before promoting your owner profile'; END IF;
  ELSE RAISE EXCEPTION 'Choose a listing or profile'; END IF;
  UPDATE public.promotion_requests SET status = 'expired' WHERE user_id = p.id AND status = 'active' AND expires_at <= now();
  SELECT * INTO r FROM public.promotion_requests WHERE user_id = p.id AND kind = p_kind AND vehicle_id IS NOT DISTINCT FROM p_vehicle_id AND status IN ('awaiting_payment','pending','active');
  IF FOUND THEN RETURN r; END IF;
  INSERT INTO public.promotion_requests(user_id,kind,vehicle_id,amount,duration_days,payment_method,payment_instructions,terms)
    VALUES (p.id,p_kind,p_vehicle_id,CASE WHEN p_kind = 'listing' THEN s.listing_price ELSE s.profile_price END,s.duration_days,s.payment_method,s.payment_instructions,s.terms) RETURNING * INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.request_promotion(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_promotion(text,uuid) TO authenticated;

CREATE FUNCTION public.submit_promotion_payment(p_id uuid, p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.promotion_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.promotion_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Promotion request not found'; END IF;
  IF r.status = 'pending' AND r.payment_reference = trim(p_reference) THEN RETURN; END IF;
  IF r.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'This request has already been submitted'; END IF;
  IF p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 3 AND 120 THEN RAISE EXCEPTION 'Enter the payment transaction reference (3–120 characters)'; END IF;
  UPDATE public.promotion_requests SET payment_reference = trim(p_reference), status = 'pending' WHERE id = r.id;
  INSERT INTO public.notifications(user_id,type,title,body,data)
    SELECT id,'system','Promotion payment to review','A member submitted a payment reference. Verify receipt before activating the promotion.',jsonb_build_object('url','/admin?tab=promotions') FROM public.profiles WHERE role = 'admin' AND NOT is_suspended;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'This payment reference has already been submitted. Contact support if you need help.';
END;
$$;
REVOKE ALL ON FUNCTION public.submit_promotion_payment(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_promotion_payment(uuid,text) TO authenticated;

CREATE FUNCTION public.review_promotion(p_id uuid, p_action text, p_note text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.promotion_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO r FROM public.promotion_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF p_action = 'approve' THEN
    IF r.status <> 'pending' THEN RAISE EXCEPTION 'Only a pending payment can be approved'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.promotion_settings WHERE id AND enabled) THEN RAISE EXCEPTION 'Enable promotions before activation'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = r.user_id AND NOT is_suspended AND (role = 'owner' OR (role = 'driver' AND onboarding_completed))) THEN RAISE EXCEPTION 'This member is not eligible for promotion'; END IF;
    IF r.kind = 'listing' AND NOT EXISTS (SELECT 1 FROM public.vehicles WHERE id = r.vehicle_id AND owner_id = r.user_id AND deleted_at IS NULL AND status = 'active' AND approval_status = 'approved') THEN RAISE EXCEPTION 'The listing must be live and approved'; END IF;
    UPDATE public.promotion_requests SET status = 'active', starts_at = now(), expires_at = now() + make_interval(days => r.duration_days), reviewed_by = auth.uid(), admin_note = nullif(trim(p_note),'') WHERE id = r.id;
  ELSIF p_action IN ('reject','cancel') THEN
    IF (p_action = 'reject' AND r.status NOT IN ('awaiting_payment','pending')) OR (p_action = 'cancel' AND r.status <> 'active') THEN RAISE EXCEPTION 'This request cannot be changed in its current state'; END IF;
    IF length(trim(COALESCE(p_note,''))) < 3 THEN RAISE EXCEPTION 'Add a reason and any refund instructions for the member'; END IF;
    UPDATE public.promotion_requests SET status = CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'cancelled' END, reviewed_by = auth.uid(), admin_note = trim(p_note) WHERE id = r.id;
  ELSE RAISE EXCEPTION 'Unsupported promotion action'; END IF;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES (r.user_id,'system',CASE WHEN p_action = 'approve' THEN 'Promotion activated' ELSE 'Promotion update' END,CASE WHEN p_action = 'approve' THEN 'Your paid promotion is active. See its end date in Promotions.' ELSE p_note END,jsonb_build_object('url','/promotions'));
END;
$$;
REVOKE ALL ON FUNCTION public.review_promotion(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_promotion(uuid,text,text) TO authenticated;

CREATE FUNCTION public.cancel_unpaid_promotion(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.promotion_requests SET status = 'cancelled' WHERE id = p_id AND user_id = auth.uid() AND status = 'awaiting_payment';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an unpaid request can be cancelled. Contact support about a submitted payment.'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_unpaid_promotion(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_unpaid_promotion(uuid) TO authenticated;

-- Public output contains target identifiers only, never payment references.
CREATE FUNCTION public.active_promotion_targets() RETURNS TABLE(kind text, target_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT r.kind, COALESCE(r.vehicle_id,r.user_id) FROM public.promotion_requests r JOIN public.profiles p ON p.id = r.user_id
  WHERE r.status = 'active' AND r.expires_at > now() AND NOT p.is_suspended
    AND EXISTS (SELECT 1 FROM public.promotion_settings WHERE id AND enabled);
$$;
REVOKE ALL ON FUNCTION public.active_promotion_targets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.active_promotion_targets() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
