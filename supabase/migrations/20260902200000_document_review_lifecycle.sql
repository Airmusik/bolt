-- A proof is a draft until explicitly submitted. Review locks are enforced in
-- Postgres as well as the UI, including requests from another browser tab.
ALTER TABLE public.driver_platform_history
  ADD COLUMN review_status text NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft','pending','approved','rejected')),
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN rejection_reason text;
ALTER TABLE public.profiles ADD COLUMN platform_history_valid_until timestamptz;
GRANT SELECT(platform_history_valid_until) ON public.profiles TO anon,authenticated;

-- Historical approvals have no reliable approval timestamp. Give those existing
-- approvals a full six-month transition period rather than inventing an old date.
UPDATE public.driver_platform_history SET
  review_status = CASE WHEN approved THEN 'approved' WHEN proof_url IS NOT NULL AND months_active > 0 THEN 'pending' ELSE 'draft' END,
  submitted_at = CASE WHEN proof_url IS NOT NULL THEN created_at END,
  reviewed_at = CASE WHEN approved THEN now() END,
  expires_at = CASE WHEN approved THEN now() + interval '6 months' END;
CREATE INDEX history_review_expiry ON public.driver_platform_history(review_status, expires_at);

CREATE TABLE public.platform_history_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  history_id uuid NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_history_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.platform_history_versions TO authenticated;
CREATE POLICY history_versions_private ON public.platform_history_versions FOR SELECT TO authenticated USING (driver_id = auth.uid() OR public.is_admin());

CREATE FUNCTION public.guard_history_lifecycle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_driver uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.driver_id ELSE NEW.driver_id END;
  v_internal boolean := current_setting('app.history_transition',true) = 'on';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('history-' || v_driver::text,0));
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_driver) THEN RETURN OLD; END IF;
    IF current_setting('app.history_delete_draft',true)='on' AND OLD.review_status='draft' AND OLD.submitted_at IS NULL AND OLD.reviewed_at IS NULL THEN RETURN OLD; END IF;
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Submitted history is retained. Only unsubmitted draft entries can be removed using the draft action.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN RAISE EXCEPTION 'History cannot be transferred'; END IF;
  IF v_internal THEN RETURN NEW; END IF;
  IF public.is_admin() THEN
    IF TG_OP = 'UPDATE' AND (NEW.approved IS DISTINCT FROM OLD.approved OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.proof_url IS DISTINCT FROM OLD.proof_url) THEN
      RAISE EXCEPTION 'Use the approve or reject history action';
    END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS DISTINCT FROM v_driver OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_driver AND role = 'driver' AND NOT is_suspended) THEN RAISE EXCEPTION 'An active driver account is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id = v_driver AND review_status = 'pending') THEN
    RAISE EXCEPTION 'Your platform history is awaiting admin review. You cannot submit or edit it again until it is approved or rejected.';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id = v_driver AND review_status = 'approved' AND expires_at > now()) THEN RAISE EXCEPTION 'Your approved history is still valid. Renewal unlocks when it expires.'; END IF;
    IF NEW.approved OR NEW.review_status <> 'draft' OR NEW.expires_at IS NOT NULL OR NEW.reviewed_at IS NOT NULL OR NEW.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'New history must be an unreviewed draft'; END IF;
    IF (SELECT count(*) FROM public.driver_platform_history WHERE driver_id = v_driver AND review_status = 'draft') >= 5 THEN RAISE EXCEPTION 'Use your existing draft entries (maximum five platforms per submission)'; END IF;
  ELSE
    IF OLD.review_status <> 'draft' THEN RAISE EXCEPTION 'Use Renew or Correct rejected history before changing this proof'; END IF;
    IF NEW.approved IS DISTINCT FROM OLD.approved OR NEW.review_status IS DISTINCT FROM OLD.review_status OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN RAISE EXCEPTION 'Review and expiry fields are server managed'; END IF;
  END IF;
  IF NEW.months_active < 0 OR NEW.months_active > 1200 THEN RAISE EXCEPTION 'Enter valid months of platform activity'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_platform_history_approval ON public.driver_platform_history;
CREATE TRIGGER guard_history_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON public.driver_platform_history FOR EACH ROW EXECUTE FUNCTION public.guard_history_lifecycle();

CREATE FUNCTION public.prepare_history_renewal(p_id uuid) RETURNS public.driver_platform_history
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.driver_platform_history%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('history-' || auth.uid()::text,0));
  SELECT * INTO h FROM public.driver_platform_history WHERE id = p_id AND driver_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'History not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id = auth.uid() AND review_status = 'pending') THEN RAISE EXCEPTION 'Wait for admin review before editing or resubmitting'; END IF;
  IF h.review_status = 'draft' THEN RETURN h; END IF;
  IF h.review_status <> 'rejected' AND NOT (h.review_status = 'approved' AND h.expires_at <= now()) THEN RAISE EXCEPTION 'Renewal is available only after expiry or rejection'; END IF;
  INSERT INTO public.platform_history_versions(history_id,driver_id,snapshot) VALUES(h.id,h.driver_id,to_jsonb(h));
  PERFORM set_config('app.history_transition','on',true);
  UPDATE public.driver_platform_history SET review_status='draft',approved=false,proof_url=NULL,submitted_at=NULL,rejection_reason=NULL WHERE id=h.id RETURNING * INTO h;
  PERFORM set_config('app.history_transition','off',true);
  RETURN h;
END;
$$;

CREATE FUNCTION public.remove_history_draft(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('history-' || auth.uid()::text,0));
  IF EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id=auth.uid() AND review_status='pending') THEN RAISE EXCEPTION 'Wait for admin review'; END IF;
  -- Submitted/renewal records must remain available for review and disputes.
  IF NOT EXISTS (SELECT 1 FROM public.driver_platform_history WHERE id=p_id AND driver_id=auth.uid() AND review_status='draft' AND reviewed_at IS NULL AND submitted_at IS NULL) THEN RAISE EXCEPTION 'Only a new unsubmitted draft can be removed'; END IF;
  PERFORM set_config('app.history_delete_draft','on',true);
  DELETE FROM public.driver_platform_history WHERE id=p_id;
  PERFORM set_config('app.history_delete_draft','off',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_profile_verification() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='driver' AND NOT is_suspended AND onboarding_completed) THEN RAISE EXCEPTION 'Complete About You with an active driver account first'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('history-' || auth.uid()::text,0));
  -- Idempotent retry: do not repeat notifications or overwrite a pending review.
  IF EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id=auth.uid() AND review_status='pending') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id=auth.uid() AND review_status='draft') THEN RAISE EXCEPTION 'No new or renewed proof to submit'; END IF;
  IF EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id=auth.uid() AND review_status='draft' AND (months_active < 1 OR NULLIF(trim(proof_url),'') IS NULL)) THEN RAISE EXCEPTION 'Add months active and upload proof for every draft platform, or remove unused draft entries'; END IF;
  PERFORM set_config('app.history_transition','on',true);
  UPDATE public.driver_platform_history SET review_status='pending',submitted_at=now(),approved=false WHERE driver_id=auth.uid() AND review_status='draft';
  PERFORM set_config('app.history_transition','off',true);
  INSERT INTO public.notifications(user_id,type,title,body,data)
    SELECT id,'trust','Platform history ready for review','A driver submitted platform history. Review their private proof.',jsonb_build_object('path','/admin?tab=history') FROM public.profiles WHERE role='admin' AND NOT is_suspended;
END;
$$;

CREATE FUNCTION public.review_platform_history(p_id uuid,p_decision text,p_reason text DEFAULT NULL,p_submitted_at timestamptz DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.driver_platform_history%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO h FROM public.driver_platform_history WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'History not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('history-' || h.driver_id::text,0));
  SELECT * INTO h FROM public.driver_platform_history WHERE id=p_id FOR UPDATE;
  IF p_submitted_at IS NULL OR h.submitted_at IS DISTINCT FROM p_submitted_at THEN RAISE EXCEPTION 'This submission changed. Refresh before reviewing'; END IF;
  IF h.review_status = p_decision THEN RETURN; END IF;
  IF h.review_status <> 'pending' THEN RAISE EXCEPTION 'Only a pending submission can be reviewed'; END IF;
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Choose approve or reject'; END IF;
  IF p_decision='rejected' AND length(trim(COALESCE(p_reason,''))) < 3 THEN RAISE EXCEPTION 'Give a clear rejection reason'; END IF;
  IF NULLIF(trim(h.proof_url),'') IS NULL OR h.months_active < 1 THEN RAISE EXCEPTION 'This submission is missing proof or activity'; END IF;
  PERFORM set_config('app.history_transition','on',true);
  UPDATE public.driver_platform_history SET review_status=p_decision,approved=p_decision='approved',reviewed_at=now(),
    expires_at=CASE WHEN p_decision='approved' THEN now()+interval '6 months' ELSE expires_at END,
    rejection_reason=CASE WHEN p_decision='rejected' THEN trim(p_reason) END WHERE id=p_id;
  PERFORM set_config('app.history_transition','off',true);
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(h.driver_id,'trust','Platform history '||p_decision,
    CASE WHEN p_decision='approved' THEN 'Your '||h.platform||' history is approved for six months. View its expiry date and countdown in Platform history.' ELSE trim(p_reason)||' You can now correct and resubmit this proof.' END,
    jsonb_build_object('path','/onboarding','history_id',h.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.derive_driver_history_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.platform_history_approved := NEW.role='driver' AND EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id=NEW.id AND review_status='approved' AND approved AND expires_at>now() AND proof_url IS NOT NULL AND months_active>0);
  NEW.platform_history_submitted := NEW.role='driver' AND EXISTS (SELECT 1 FROM public.driver_platform_history WHERE driver_id=NEW.id AND review_status='pending');
  NEW.platform_history_valid_until := (SELECT max(expires_at) FROM public.driver_platform_history WHERE driver_id=NEW.id AND review_status='approved' AND approved AND proof_url IS NOT NULL AND months_active>0);
  RETURN NEW;
END;
$$;
DROP TRIGGER derive_driver_history_state ON public.profiles;
CREATE TRIGGER derive_driver_history_state BEFORE INSERT OR UPDATE OF platform_history_approved,platform_history_submitted,platform_history_valid_until,role ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.derive_driver_history_state();
CREATE OR REPLACE FUNCTION public.refresh_driver_history_state() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := CASE WHEN TG_OP='DELETE' THEN OLD.driver_id ELSE NEW.driver_id END;
BEGIN
  PERFORM set_config('app.profile_system_update','on',true);
  UPDATE public.profiles SET platform_history_approved=false,platform_history_submitted=false WHERE id=v_id;
  UPDATE public.profiles SET is_verified=platform_history_approved,
    verification_status=CASE WHEN platform_history_submitted THEN 'pending' WHEN platform_history_approved THEN 'approved' WHEN EXISTS(SELECT 1 FROM public.driver_platform_history WHERE driver_id=v_id AND review_status='rejected') THEN 'rejected' ELSE 'unverified' END WHERE id=v_id AND role='driver';
  PERFORM set_config('app.profile_system_update','off',true);
  RETURN NULL;
END;
$$;
UPDATE public.profiles SET platform_history_approved=false,platform_history_submitted=false;

CREATE OR REPLACE FUNCTION public.require_approved_driver_history(p_user_id uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND role='driver' AND document_listing_visibility<>'public') THEN RAISE EXCEPTION 'This driver listing is private or removed. Contact support after renewing the evidence.'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND role='driver') AND NOT EXISTS(SELECT 1 FROM public.driver_platform_history WHERE driver_id=p_user_id AND review_status='approved' AND approved AND expires_at>now() AND proof_url IS NOT NULL AND months_active>0) THEN
    IF EXISTS(SELECT 1 FROM public.driver_platform_history WHERE driver_id=p_user_id AND review_status='pending') THEN RAISE EXCEPTION 'Your platform history is awaiting admin approval. Connections and availability unlock after approval.'; END IF;
    RAISE EXCEPTION 'Submit or renew your recent platform history for admin approval before connecting or changing availability.';
  END IF;
END;
$$;

-- A visibility action removes a listing, not a member account or saved chats.
ALTER TABLE public.profiles ADD COLUMN document_listing_visibility text NOT NULL DEFAULT 'public' CHECK(document_listing_visibility IN ('public','private','deleted'));
ALTER TABLE public.vehicles ADD COLUMN document_listing_visibility text NOT NULL DEFAULT 'public' CHECK(document_listing_visibility IN ('public','private','deleted'));
GRANT SELECT(document_listing_visibility) ON public.profiles TO anon,authenticated;
CREATE FUNCTION public.guard_document_visibility() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.document_listing_visibility<>'public') OR (TG_OP='UPDATE' AND NEW.document_listing_visibility IS DISTINCT FROM OLD.document_listing_visibility) THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Only admins can change document-related listing visibility'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_document_visibility BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_document_visibility();
CREATE TRIGGER guard_document_visibility BEFORE INSERT OR UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.guard_document_visibility();
CREATE POLICY profile_document_visibility ON public.profiles AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(document_listing_visibility='public' OR id=auth.uid() OR public.is_admin());
CREATE POLICY vehicle_document_visibility ON public.vehicles AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(document_listing_visibility='public' OR owner_id=auth.uid() OR public.is_admin());

CREATE FUNCTION public.admin_document_listing_action(p_user_id uuid,p_vehicle_id uuid,p_action text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_action NOT IN ('private','deleted','public') THEN RAISE EXCEPTION 'Choose private, delete or restore'; END IF;
  IF p_vehicle_id IS NULL THEN
    IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user_id AND role='driver') THEN RAISE EXCEPTION 'Driver listing not found'; END IF;
    IF p_action='public' AND NOT EXISTS(SELECT 1 FROM public.driver_platform_history WHERE driver_id=p_user_id AND review_status='approved' AND approved AND expires_at>now() AND proof_url IS NOT NULL AND months_active>0) THEN RAISE EXCEPTION 'Submit or renew platform history before restoring this listing'; END IF;
    UPDATE public.profiles SET document_listing_visibility=p_action WHERE id=p_user_id;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.vehicles WHERE id=p_vehicle_id AND owner_id=p_user_id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Vehicle listing not found'; END IF;
    IF p_action='public' AND EXISTS(SELECT 1 FROM public.documents WHERE vehicle_id=p_vehicle_id AND expiry_date<current_date AND type IN ('work_history','other_trust_evidence')) THEN RAISE EXCEPTION 'Review renewed evidence before restoring this listing'; END IF;
    UPDATE public.vehicles SET document_listing_visibility=p_action WHERE id=p_vehicle_id;
  END IF;
  INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(p_user_id,'document_listing','Listing visibility updated',
    CASE p_action WHEN 'public' THEN 'Support restored your listing to public visibility.' WHEN 'private' THEN 'Support made your listing private because its documents expired. Update your evidence and contact support to restore it.' ELSE 'Support removed your listing from public discovery because its documents expired. Your account and chat history remain saved. Update your evidence and contact support.' END,
    jsonb_build_object('path',CASE WHEN p_vehicle_id IS NULL THEN '/onboarding' ELSE '/vehicles/'||p_vehicle_id::text||'/edit' END));
END;
$$;

-- Legacy non-KYC evidence uses the same six-month approval period. Identity,
-- ownership and reference-letter requirements are not reintroduced.
ALTER TABLE public.documents ADD COLUMN reviewed_at timestamptz;
UPDATE public.documents SET reviewed_at=now(),expiry_date=(now()+interval '6 months')::date WHERE verified AND type IN ('work_history','other_trust_evidence') AND expiry_date IS NULL;
CREATE FUNCTION public.guard_evidence_lifecycle() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.type IN ('work_history','other_trust_evidence') AND NOT public.is_admin() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=OLD.user_id) THEN RAISE EXCEPTION 'Submitted evidence is retained for review'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.type IN ('work_history','other_trust_evidence') AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.type IS DISTINCT FROM OLD.type) THEN RAISE EXCEPTION 'Evidence cannot be transferred'; END IF;
  IF NEW.type NOT IN ('work_history','other_trust_evidence') THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('evidence-'||NEW.user_id::text,0));
  IF TG_OP='INSERT' AND NOT public.is_admin() AND EXISTS(SELECT 1 FROM public.documents WHERE user_id=NEW.user_id AND type=NEW.type AND vehicle_id IS NOT DISTINCT FROM NEW.vehicle_id) THEN RAISE EXCEPTION 'Use your existing evidence entry instead of creating another submission'; END IF;
  IF public.is_admin() THEN
    IF NEW.verified AND (TG_OP='INSERT' OR NOT OLD.verified) THEN NEW.reviewed_at:=now(); NEW.expiry_date:=(now()+interval '6 months')::date; END IF;
  ELSIF TG_OP='UPDATE' THEN
    IF NOT OLD.rejected AND (NOT OLD.verified OR OLD.expiry_date>=current_date) THEN RAISE EXCEPTION 'Evidence is locked until rejected or expired'; END IF;
    IF NEW.expiry_date IS DISTINCT FROM OLD.expiry_date OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN RAISE EXCEPTION 'Expiry is server managed'; END IF;
    IF NEW.file_url IS NOT DISTINCT FROM OLD.file_url THEN RAISE EXCEPTION 'Choose updated proof before resubmitting'; END IF;
  ELSIF NEW.expiry_date IS NOT NULL OR NEW.reviewed_at IS NOT NULL THEN RAISE EXCEPTION 'Expiry is server managed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_evidence_lifecycle BEFORE INSERT OR UPDATE OR DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_evidence_lifecycle();

REVOKE ALL ON FUNCTION public.prepare_history_renewal(uuid),public.remove_history_draft(uuid),public.review_platform_history(uuid,text,text,timestamptz),public.admin_document_listing_action(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_history_renewal(uuid),public.remove_history_draft(uuid),public.review_platform_history(uuid,text,text,timestamptz),public.admin_document_listing_action(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
