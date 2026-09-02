-- Do not classify official support as a reportable marketplace member.
CREATE FUNCTION public.prevent_support_member_report() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.reported_id AND role = 'admin')
     OR (NEW.target_type = 'user' AND EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.target_id AND role = 'admin'))
     OR (NEW.target_type = 'conversation' AND EXISTS (
       SELECT 1 FROM public.conversations WHERE id = NEW.target_id AND admin_id IS NOT NULL AND (driver_id IS NULL OR owner_id IS NULL)
     ))
  THEN RAISE EXCEPTION 'Use the support contact details for a complaint about support; official support is not a reportable member'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.prevent_support_member_report() FROM PUBLIC;
CREATE TRIGGER prevent_support_member_report BEFORE INSERT OR UPDATE OF reported_id, target_type, target_id ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.prevent_support_member_report();

CREATE TABLE public.registration_terms_documents (
  version text PRIMARY KEY,
  document jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.registration_terms_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY terms_documents_read ON public.registration_terms_documents FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.registration_terms_documents TO anon, authenticated;

CREATE TABLE public.registration_terms_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version text NOT NULL REFERENCES public.registration_terms_documents(version),
  enforce_acceptance boolean NOT NULL DEFAULT false
);
ALTER TABLE public.registration_terms_policy ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.registration_terms_acceptances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  version text NOT NULL REFERENCES public.registration_terms_documents(version),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  site_name text NOT NULL,
  support_email text NOT NULL,
  support_phone text NOT NULL,
  acceptance_source text NOT NULL DEFAULT 'registration_checkbox' CHECK (acceptance_source = 'registration_checkbox')
);
ALTER TABLE public.registration_terms_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY terms_acceptance_read_own_or_admin ON public.registration_terms_acceptances FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.registration_terms_acceptances TO authenticated;
REVOKE ALL ON public.registration_terms_acceptances FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.registration_terms_acceptances, public.registration_terms_documents, public.registration_terms_policy FROM anon, authenticated;

CREATE FUNCTION public.check_registration_terms(p_version text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.registration_terms_policy WHERE singleton AND version = p_version);
$$;
REVOKE ALL ON FUNCTION public.check_registration_terms(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_registration_terms(text) TO anon, authenticated;

CREATE FUNCTION public.record_registration_terms() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE policy public.registration_terms_policy;
BEGIN
  SELECT * INTO policy FROM public.registration_terms_policy WHERE singleton;
  IF NEW.raw_user_meta_data -> 'terms_accepted' = 'true'::jsonb AND NEW.raw_user_meta_data ->> 'terms_version' = policy.version THEN
    INSERT INTO public.registration_terms_acceptances(user_id,version,site_name,support_email,support_phone)
    SELECT NEW.id, policy.version,
      COALESCE((SELECT value FROM public.site_settings WHERE key = 'site_name'), 'Drivevell'),
      COALESCE((SELECT value FROM public.site_settings WHERE key = 'admin_contact_email'), ''),
      COALESCE((SELECT value FROM public.site_settings WHERE key = 'admin_contact_phone'), '');
  ELSIF policy.enforce_acceptance THEN
    RAISE EXCEPTION 'Accept the current Terms of Service before registering';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.record_registration_terms() FROM PUBLIC;
CREATE TRIGGER trg_record_registration_terms AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.record_registration_terms();
-- The document and disabled rollout policy are inserted by the next migration.
-- Enforcement is enabled after deploying the matching registration form.
NOTIFY pgrst, 'reload schema';
