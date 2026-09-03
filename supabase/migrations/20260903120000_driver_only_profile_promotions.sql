-- Preserve paid campaigns/history, but prevent new owner-profile quotes.
ALTER FUNCTION public.request_promotion(text, uuid) RENAME TO request_promotion_before_role_gate;
REVOKE ALL ON FUNCTION public.request_promotion_before_role_gate(text, uuid) FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.request_promotion(p_kind text, p_vehicle_id uuid DEFAULT NULL)
RETURNS public.promotion_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_kind = 'profile' AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'driver'
  ) THEN
    RAISE EXCEPTION 'Only drivers can promote a profile. Car owners can promote their cars.';
  END IF;
  RETURN public.request_promotion_before_role_gate(p_kind, p_vehicle_id);
END;
$$;
REVOKE ALL ON FUNCTION public.request_promotion(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_promotion(text, uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
