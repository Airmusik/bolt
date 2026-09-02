-- Permit the narrowly scoped resubmission RPC to change moderation fields
-- while keeping direct owner updates unable to approve or unpublish listings.

CREATE OR REPLACE FUNCTION public.protect_vehicle_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() OR current_setting('app.vehicle_resubmission', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.approval_status := 'pending';
    NEW.approval_note := NULL;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  NEW.approval_status := OLD.approval_status;
  NEW.approval_note := OLD.approval_note;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.resubmit_vehicle_listing(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id AND owner_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Vehicle listing not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_photos WHERE vehicle_id = p_vehicle_id AND NOT rejected
  ) THEN RAISE EXCEPTION 'Add at least one acceptable vehicle photo before resubmitting'; END IF;

  PERFORM set_config('app.vehicle_resubmission', 'on', true);
  UPDATE public.vehicles
  SET approval_status = 'pending', approval_note = NULL, approved_at = NULL, approved_by = NULL
  WHERE id = p_vehicle_id AND owner_id = auth.uid() AND approval_status = 'rejected';
END;
$$;
REVOKE ALL ON FUNCTION public.resubmit_vehicle_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_vehicle_listing(uuid) TO authenticated;
