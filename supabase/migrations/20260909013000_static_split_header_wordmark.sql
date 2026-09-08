UPDATE public.site_settings
SET value = 'off', updated_at = now()
WHERE key = 'header_name_animation' AND value = 'glow';
