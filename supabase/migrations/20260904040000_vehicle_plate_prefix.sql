BEGIN;
-- Existing listings remain valid without inventing their registration details.
ALTER TABLE public.vehicles ADD COLUMN plate_prefix text;
ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_plate_prefix_format
  CHECK (plate_prefix IS NULL OR plate_prefix ~ '^[A-Z]{3}$');
COMMENT ON COLUMN public.vehicles.plate_prefix IS 'First three registration letters only; never store the complete number plate here.';
COMMIT;
