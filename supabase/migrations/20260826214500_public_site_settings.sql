DROP POLICY IF EXISTS "settings_read_all" ON public.site_settings;
CREATE POLICY "settings_read_all" ON public.site_settings
  FOR SELECT TO anon, authenticated
  USING (true);
