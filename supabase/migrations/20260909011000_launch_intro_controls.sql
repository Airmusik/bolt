INSERT INTO public.site_settings (key, value, updated_at)
VALUES
  ('launch_intro_enabled', 'true', now()),
  ('launch_intro_background_enabled', 'true', now())
ON CONFLICT (key) DO NOTHING;
