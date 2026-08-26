INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('site_tagline', 'The right driver. The right car. A trusted connection.', now())
ON CONFLICT (key) DO NOTHING;
