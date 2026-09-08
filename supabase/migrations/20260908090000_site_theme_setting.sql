INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('site_theme', 'heritage', now())
ON CONFLICT (key) DO NOTHING;
