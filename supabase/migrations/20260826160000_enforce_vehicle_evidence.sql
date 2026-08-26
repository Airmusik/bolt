-- Owners may create a closed draft first, but a new vehicle cannot become an
-- active listing until both required private evidence records exist.
CREATE OR REPLACE FUNCTION public.enforce_vehicle_evidence_before_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin()
    AND NEW.status = 'active'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active')
    AND NOT (
      EXISTS (
        SELECT 1 FROM public.documents
        WHERE vehicle_id = NEW.id AND user_id = NEW.owner_id AND type = 'vehicle_ownership'
      )
      AND EXISTS (
        SELECT 1 FROM public.documents
        WHERE vehicle_id = NEW.id AND user_id = NEW.owner_id AND type = 'vehicle_inspection'
      )
    )
  THEN
    RAISE EXCEPTION 'Ownership evidence and vehicle inspection are required before publishing';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vehicle_evidence_before_activation ON public.vehicles;
CREATE TRIGGER trg_enforce_vehicle_evidence_before_activation
  BEFORE INSERT OR UPDATE OF status ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_vehicle_evidence_before_activation();
