-- Suspended accounts must not retain privileges through role-only RPC checks.
-- Existing active admins and the SQL-operator provisioning workflow are unchanged.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id=auth.uid() AND role='admin' AND NOT coalesce(is_suspended,false)
  );
$$;
