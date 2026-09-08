CREATE TABLE IF NOT EXISTS public.availability_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.availability_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS availability_settings_read ON public.availability_settings;
CREATE POLICY availability_settings_read ON public.availability_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS availability_settings_write_own ON public.availability_settings;
CREATE POLICY availability_settings_write_own ON public.availability_settings FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_settings TO authenticated;
