CREATE TABLE IF NOT EXISTS public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  available boolean NOT NULL DEFAULT true,
  start_time time NOT NULL DEFAULT '08:00',
  end_time time NOT NULL DEFAULT '18:00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_of_week),
  CHECK (end_time > start_time)
);
ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS availability_slots_read ON public.availability_slots;
CREATE POLICY availability_slots_read ON public.availability_slots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS availability_slots_write_own ON public.availability_slots;
CREATE POLICY availability_slots_write_own ON public.availability_slots FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_slots TO authenticated;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.availability_slots; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
