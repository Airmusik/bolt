INSERT INTO public.site_settings(key, value, updated_at) VALUES
  ('homepage_background_position_x', '50', now()),
  ('homepage_background_position_y', '50', now())
ON CONFLICT (key) DO NOTHING;
