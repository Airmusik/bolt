INSERT INTO public.site_settings(key, value, updated_at) VALUES
  ('homepage_background_enabled', 'false', now()),
  ('homepage_background_type', 'none', now()),
  ('homepage_background_url', '', now()),
  ('homepage_background_overlay', '78', now())
ON CONFLICT (key) DO NOTHING;

UPDATE storage.buckets
SET file_size_limit = 8388608,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
WHERE id = 'site-assets';
