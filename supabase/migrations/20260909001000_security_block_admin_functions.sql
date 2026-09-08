CREATE OR REPLACE FUNCTION public.admin_add_security_block(
  p_kind text,
  p_value text,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_value text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_kind NOT IN ('email', 'phone', 'device') THEN
    RAISE EXCEPTION 'Choose a valid block type';
  END IF;
  v_value := CASE WHEN p_kind = 'email' THEN lower(trim(p_value)) ELSE trim(p_value) END;
  IF v_value = '' OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Enter a value and reason';
  END IF;

  SELECT id INTO v_id
  FROM public.security_blocks
  WHERE kind = p_kind AND value = v_value AND active
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.security_blocks(kind, value, reason, created_by)
    VALUES (p_kind, v_value, trim(p_reason), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.security_blocks
    SET reason = trim(p_reason), expires_at = NULL
    WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_security_block_active(
  p_id uuid,
  p_active boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  UPDATE public.security_blocks SET active = p_active WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Security block not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_security_block(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_security_block_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_security_block(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_security_block_active(uuid,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
