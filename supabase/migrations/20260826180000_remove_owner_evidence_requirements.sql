-- Owner vehicle listings no longer collect logbooks or inspection reports.
-- Trust is built through moderated vehicle photos, transparent listing details,
-- platform activity and reviews instead of storing sensitive ownership documents.
DROP TRIGGER IF EXISTS trg_enforce_vehicle_evidence_before_activation ON public.vehicles;
DROP FUNCTION IF EXISTS public.enforce_vehicle_evidence_before_activation();

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS minimum_driver_experience_years integer NOT NULL DEFAULT 0;

ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_minimum_driver_experience_years_check;

ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_minimum_driver_experience_years_check
  CHECK (minimum_driver_experience_years BETWEEN 0 AND 50);
