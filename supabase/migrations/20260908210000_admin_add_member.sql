ALTER TABLE public.registration_terms_acceptances DROP CONSTRAINT IF EXISTS registration_terms_acceptances_acceptance_source_check;
ALTER TABLE public.registration_terms_acceptances ADD CONSTRAINT registration_terms_acceptances_acceptance_source_check CHECK (acceptance_source IN ('registration_checkbox','admin_attested'));
CREATE TABLE IF NOT EXISTS public.admin_member_creation_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,member_id uuid NOT NULL,admin_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.admin_member_creation_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_member_creation_audit FROM anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_create_member(p_email text,p_password text,p_full_name text,p_phone text,p_role text,p_location text,p_languages text[],p_terms_accepted boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth,extensions AS $$
DECLARE member_id uuid:=gen_random_uuid(); member_email text:=lower(trim(coalesce(p_email,''))); member_name text:=regexp_replace(trim(coalesce(p_full_name,'')),'\s+',' ','g'); member_phone text:=trim(coalesce(p_phone,'')); terms_version text; auth_instance uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF member_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Enter a valid email address'; END IF;
 IF length(p_password)<10 OR p_password !~ '[a-z]' OR p_password !~ '[A-Z]' OR p_password !~ '[0-9]' THEN RAISE EXCEPTION 'Password must have at least 10 characters, uppercase, lowercase and a number'; END IF;
 IF array_length(regexp_split_to_array(member_name,'\s+'),1)<2 THEN RAISE EXCEPTION 'Enter first and second name'; END IF;
 IF member_phone !~ '^\+254[0-9]{9}$' THEN RAISE EXCEPTION 'Enter a valid Kenyan phone number'; END IF;
 IF p_role NOT IN ('driver','owner') THEN RAISE EXCEPTION 'Choose driver or car owner'; END IF;
 IF length(trim(coalesce(p_location,'')))<2 THEN RAISE EXCEPTION 'Enter the residential area'; END IF;
 IF coalesce(array_length(p_languages,1),0)<2 THEN RAISE EXCEPTION 'Add at least two languages'; END IF;
 IF NOT p_terms_accepted THEN RAISE EXCEPTION 'Confirm that the member accepted the current Terms'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=member_email) THEN RAISE EXCEPTION 'This email is already registered'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE phone=member_phone) THEN RAISE EXCEPTION 'This phone number is already registered'; END IF;
 SELECT version INTO terms_version FROM public.registration_terms_policy WHERE singleton;
 SELECT instance_id INTO auth_instance FROM auth.users WHERE instance_id IS NOT NULL LIMIT 1;
 auth_instance:=coalesce(auth_instance,'00000000-0000-0000-0000-000000000000'::uuid);
 INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token)
 VALUES(auth_instance,member_id,'authenticated','authenticated',member_email,crypt(p_password,gen_salt('bf')),NULL,jsonb_build_object('provider','email','providers',jsonb_build_array('email')),jsonb_build_object('full_name',member_name,'role',p_role,'phone',member_phone,'email',member_email,'location',trim(p_location),'languages',to_jsonb(p_languages),'terms_accepted',true,'terms_version',terms_version),now(),now(),'','','','','','');
 INSERT INTO auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at) VALUES(member_id::text,member_id,jsonb_build_object('sub',member_id::text,'email',member_email,'email_verified',false),'email',NULL,now(),now());
 UPDATE public.profiles SET location=trim(p_location),languages=p_languages WHERE id=member_id;
 UPDATE public.registration_terms_acceptances SET acceptance_source='admin_attested' WHERE user_id=member_id;
 INSERT INTO public.admin_member_creation_audit(member_id,admin_id) VALUES(member_id,auth.uid());
 RETURN member_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_member(text,text,text,text,text,text,text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_member(text,text,text,text,text,text,text[],boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
