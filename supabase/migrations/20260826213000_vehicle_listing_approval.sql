ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.vehicles
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE approval_status IS NULL;

ALTER TABLE public.vehicles
  ALTER COLUMN approval_status SET DEFAULT 'pending',
  ALTER COLUMN approval_status SET NOT NULL;

ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_approval_status_check;
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_approval_status_check
  CHECK (approval_status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_vehicles_approval_status ON public.vehicles(approval_status);

DROP POLICY IF EXISTS "vehicles_read_all" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_read_visible" ON public.vehicles;
CREATE POLICY "vehicles_read_visible" ON public.vehicles
  FOR SELECT TO anon, authenticated
  USING (
    approval_status = 'approved'
    OR owner_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "vehicle_photos_read_approved_owner_admin" ON public.vehicle_photos;
CREATE POLICY "vehicle_photos_read_approved_owner_admin" ON public.vehicle_photos
  FOR SELECT TO anon, authenticated
  USING (
    (approved AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND v.approval_status = 'approved'
    ))
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND v.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "vehicle_issues_read_all" ON public.vehicle_issues;
CREATE POLICY "vehicle_issues_read_visible" ON public.vehicle_issues
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id
    )
  );

DROP POLICY IF EXISTS "vehicles_admin_update" ON public.vehicles;
CREATE POLICY "vehicles_admin_update" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "vehicles_admin_delete" ON public.vehicles;
CREATE POLICY "vehicles_admin_delete" ON public.vehicles
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_vehicle_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
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

  IF ROW(NEW.make, NEW.model, NEW.year, NEW.transmission, NEW.fuel_type,
         NEW.location, NEW.weekly_target, NEW.monthly_target, NEW.deposit,
         NEW.driver_experience, NEW.minimum_driver_experience_years,
         NEW.requirements, NEW.insurance_type, NEW.insurance_expiry,
         NEW.available_from)
     IS DISTINCT FROM
     ROW(OLD.make, OLD.model, OLD.year, OLD.transmission, OLD.fuel_type,
         OLD.location, OLD.weekly_target, OLD.monthly_target, OLD.deposit,
         OLD.driver_experience, OLD.minimum_driver_experience_years,
         OLD.requirements, OLD.insurance_type, OLD.insurance_expiry,
         OLD.available_from) THEN
    NEW.approval_status := 'pending';
    NEW.approval_note := NULL;
    NEW.approved_at := NULL;
    NEW.approved_by := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_vehicle_approval_fields_trigger ON public.vehicles;
CREATE TRIGGER protect_vehicle_approval_fields_trigger
BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.protect_vehicle_approval_fields();
