INSERT INTO public.site_settings(key, value, updated_at)
VALUES (
  'admin_nav_order',
  'overview,members,cars,contact,chat,documents,reports,expired,updates,analytics,promotions,advertisements,content,controls,security,history,settings',
  now()
)
ON CONFLICT (key) DO NOTHING;
