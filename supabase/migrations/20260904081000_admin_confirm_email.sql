BEGIN;
CREATE TABLE reminder_private.email_confirmation_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 admin_id uuid NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON reminder_private.email_confirmation_audit FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_confirm_member_email(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND role IN ('owner','driver')) THEN RAISE EXCEPTION 'Member not found'; END IF;
 UPDATE auth.users SET email_confirmed_at=now(),updated_at=now() WHERE id=p_user AND email_confirmed_at IS NULL AND nullif(email,'') IS NOT NULL;
 IF FOUND THEN INSERT INTO reminder_private.email_confirmation_audit(user_id,admin_id) VALUES(p_user,auth.uid()); END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_confirm_member_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_member_email(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
