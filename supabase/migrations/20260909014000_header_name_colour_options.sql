INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('header_name_colours', 'split', now())
ON CONFLICT (key) DO NOTHING;
