INSERT INTO public.site_settings(key, value, updated_at) VALUES
  ('footer_description', 'Connecting car owners and ride-hailing drivers across Kenya.', now()),
  ('footer_company_title', 'Company', now()),
  ('footer_company_about_label', 'About', now()),
  ('footer_company_contact_label', 'Contact', now()),
  ('footer_company_faq_label', 'FAQ', now()),
  ('footer_company_how_label', 'How it works', now()),
  ('footer_legal_title', 'Legal', now()),
  ('footer_legal_terms_label', 'Terms of Service', now()),
  ('footer_legal_privacy_label', 'Privacy Policy', now()),
  ('footer_legal_contact_label', 'Contact Us', now()),
  ('footer_contact_title', 'Get in touch', now()),
  ('footer_location', 'Nairobi, Kenya', now()),
  ('footer_copyright_note', 'All rights reserved. 11Drive does not process payments between users.', now())
ON CONFLICT (key) DO NOTHING;
