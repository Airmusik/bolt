-- Google authenticates the email; membership is created only after the user
-- chooses a role, supplies the required details and accepts current terms.
-- Email/password signup keeps its existing trigger behavior.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_languages text[];
BEGIN
  -- app metadata is set by Supabase Auth, unlike editable user metadata.
  IF NEW.raw_app_meta_data ->> 'provider' = 'google' THEN RETURN NEW; END IF;
  v_role := CASE WHEN NEW.raw_user_meta_data ->> 'role' IN ('driver','owner')
    THEN NEW.raw_user_meta_data ->> 'role' ELSE 'driver' END;
  SELECT COALESCE(array_agg(trim(language)) FILTER (WHERE length(trim(language)) > 0), '{}'::text[])
    INTO v_languages FROM jsonb_array_elements_text(CASE
      WHEN jsonb_typeof(NEW.raw_user_meta_data -> 'languages') = 'array'
      THEN NEW.raw_user_meta_data -> 'languages' ELSE '[]'::jsonb END) AS supplied(language);
  INSERT INTO public.profiles(id,role,full_name,phone,email,location,languages,onboarding_completed)
    VALUES (NEW.id,v_role,COALESCE(NEW.raw_user_meta_data ->> 'full_name',''),
      NULLIF(NEW.raw_user_meta_data ->> 'phone',''),NEW.email,
      NULLIF(trim(NEW.raw_user_meta_data ->> 'location'),''),v_languages,v_role <> 'driver')
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_registration_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE policy public.registration_terms_policy;
BEGIN
  -- No implied acceptance from Google consent. The completion RPC records the
  -- checkbox later, in the same transaction that creates the member profile.
  IF NEW.raw_app_meta_data ->> 'provider' = 'google' THEN RETURN NEW; END IF;
  SELECT * INTO policy FROM public.registration_terms_policy WHERE singleton;
  IF NEW.raw_user_meta_data -> 'terms_accepted' = 'true'::jsonb AND NEW.raw_user_meta_data ->> 'terms_version' = policy.version THEN
    INSERT INTO public.registration_terms_acceptances(user_id,version,site_name,support_email,support_phone)
    SELECT NEW.id,policy.version,
      COALESCE((SELECT value FROM public.site_settings WHERE key='site_name'),'11Drive'),
      COALESCE((SELECT value FROM public.site_settings WHERE key='admin_contact_email'),''),
      COALESCE((SELECT value FROM public.site_settings WHERE key='admin_contact_phone'),'');
  ELSIF policy.enforce_acceptance THEN
    RAISE EXCEPTION 'Accept the current Terms of Service before registering';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.record_registration_terms() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.google_registration_pending() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND u.raw_app_meta_data ->> 'provider'='google')
    AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid());
$$;
REVOKE ALL ON FUNCTION public.google_registration_pending() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_registration_pending() TO authenticated;

-- Also block old clients' minimal-profile fallback. SECURITY DEFINER signup
-- completion bypasses RLS, whereas browser INSERT/UPSERT cannot bypass this.
CREATE POLICY profiles_google_setup_required ON public.profiles AS RESTRICTIVE
FOR INSERT TO authenticated WITH CHECK (NOT public.google_registration_pending());

CREATE FUNCTION public.complete_google_registration(
  p_role text, p_full_name text, p_phone text, p_location text,
  p_languages text[], p_terms_version text, p_accept_terms boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user auth.users;
  v_name text := regexp_replace(trim(p_full_name), '\s+', ' ', 'g');
  v_languages text[];
  v_policy public.registration_terms_policy;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in with Google first' USING ERRCODE='42501'; END IF;
  -- Serializes double-submits for this one user; cannot target another account.
  SELECT * INTO v_user FROM auth.users WHERE id=auth.uid() FOR UPDATE;
  IF NOT FOUND OR v_user.raw_app_meta_data ->> 'provider' IS DISTINCT FROM 'google'
     OR NULLIF(v_user.email,'') IS NULL OR v_user.email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Sign in with a confirmed Google account first' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id=v_user.id) THEN
    RAISE EXCEPTION 'Account setup is already complete';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('driver','owner') THEN RAISE EXCEPTION 'Choose driver or car owner'; END IF;
  IF v_name IS NULL OR length(v_name)>160 OR array_length(string_to_array(v_name,' '),1)<2
     OR EXISTS(SELECT 1 FROM unnest(string_to_array(v_name,' ')) AS part WHERE length(part)<2) THEN
    RAISE EXCEPTION 'Enter your first and second name';
  END IF;
  IF p_phone IS NULL OR p_phone !~ '^\+254[0-9]{9}$' THEN RAISE EXCEPTION 'Enter a valid Kenyan phone number'; END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE phone=p_phone) THEN RAISE EXCEPTION 'This phone number is already registered'; END IF;
  IF p_location IS NULL OR length(trim(p_location)) NOT BETWEEN 2 AND 200 THEN RAISE EXCEPTION 'Enter your town or neighbourhood'; END IF;
  SELECT array_agg(language ORDER BY language) INTO v_languages FROM (
    SELECT DISTINCT ON (lower(trim(item))) trim(item) AS language
    FROM unnest(p_languages) AS item WHERE length(trim(item)) BETWEEN 1 AND 60
    ORDER BY lower(trim(item)),trim(item)
  ) AS chosen;
  IF COALESCE(array_length(v_languages,1),0) NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'Add at least two different languages'; END IF;
  SELECT * INTO v_policy FROM public.registration_terms_policy WHERE singleton FOR SHARE;
  IF p_accept_terms IS DISTINCT FROM true OR v_policy.version IS NULL
     OR p_terms_version IS DISTINCT FROM v_policy.version THEN RAISE EXCEPTION 'Accept the current Terms of Service before registering'; END IF;

  INSERT INTO public.profiles(id,role,full_name,phone,email,location,languages,onboarding_completed)
    VALUES(v_user.id,p_role,v_name,p_phone,v_user.email,trim(p_location),v_languages,p_role='owner');
  INSERT INTO public.registration_terms_acceptances(user_id,version,site_name,support_email,support_phone)
    SELECT v_user.id,v_policy.version,
      COALESCE((SELECT value FROM public.site_settings WHERE key='site_name'),'11Drive'),
      COALESCE((SELECT value FROM public.site_settings WHERE key='admin_contact_email'),''),
      COALESCE((SELECT value FROM public.site_settings WHERE key='admin_contact_phone'),'');
  RETURN v_user.id;
END; $$;
REVOKE ALL ON FUNCTION public.complete_google_registration(text,text,text,text,text[],text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_google_registration(text,text,text,text,text[],text,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
