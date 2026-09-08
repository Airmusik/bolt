INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('header_name_animation', 'glow', now())
ON CONFLICT (key) DO NOTHING;
