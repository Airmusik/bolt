BEGIN;
CREATE FUNCTION public.admin_list_members() RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 RETURN QUERY SELECT to_jsonb(p)||jsonb_build_object('email',u.email,'email_confirmed',u.email_confirmed_at IS NOT NULL)
 FROM public.profiles p JOIN auth.users u ON u.id=p.id ORDER BY p.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_members() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_members() TO authenticated;
CREATE FUNCTION public.member_email_confirmed(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=p_id AND email_confirmed_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.member_email_confirmed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_email_confirmed(uuid) TO anon,authenticated;
CREATE POLICY profiles_confirmed_visibility ON public.profiles AS RESTRICTIVE FOR SELECT TO anon,authenticated
USING (id=auth.uid() OR public.is_admin() OR public.member_email_confirmed(id));
NOTIFY pgrst,'reload schema';
COMMIT;
