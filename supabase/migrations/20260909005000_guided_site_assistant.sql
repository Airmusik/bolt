INSERT INTO public.site_settings (key, value)
VALUES
  ('chatbot_enabled', 'true'),
  ('chatbot_title', '11Drive Assistant'),
  ('chatbot_welcome', 'Hi! Ask me how 11Drive works, about connections, listings, documents, safety, or your account.'),
  ('chatbot_unanswered_logging', 'true')
ON CONFLICT (key) DO NOTHING;

UPDATE public.site_settings
SET value = value || ',assistant', updated_at = now()
WHERE key = 'admin_nav_order'
  AND NOT ('assistant' = ANY(string_to_array(value, ',')));

CREATE TABLE IF NOT EXISTS public.chatbot_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (char_length(question) BETWEEN 4 AND 180),
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 8 AND 2000),
  keywords text[] NOT NULL DEFAULT '{}',
  link_path text,
  link_label text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatbot_articles_read ON public.chatbot_articles;
CREATE POLICY chatbot_articles_read ON public.chatbot_articles FOR SELECT TO anon, authenticated
  USING (enabled OR public.is_admin());
DROP POLICY IF EXISTS chatbot_articles_admin_insert ON public.chatbot_articles;
CREATE POLICY chatbot_articles_admin_insert ON public.chatbot_articles FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS chatbot_articles_admin_update ON public.chatbot_articles;
CREATE POLICY chatbot_articles_admin_update ON public.chatbot_articles FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS chatbot_articles_admin_delete ON public.chatbot_articles;
CREATE POLICY chatbot_articles_admin_delete ON public.chatbot_articles FOR DELETE TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.chatbot_articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.chatbot_articles TO authenticated;

CREATE TABLE IF NOT EXISTS public.chatbot_unanswered (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_query text NOT NULL UNIQUE,
  query_text text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  first_asked_at timestamptz NOT NULL DEFAULT now(),
  last_asked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chatbot_unanswered ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chatbot_unanswered_admin_read ON public.chatbot_unanswered;
CREATE POLICY chatbot_unanswered_admin_read ON public.chatbot_unanswered FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.chatbot_unanswered TO authenticated;

CREATE OR REPLACE FUNCTION public.log_chatbot_unanswered(p_query text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cleaned text;
  normalized text;
BEGIN
  IF COALESCE((SELECT value FROM public.site_settings WHERE key = 'chatbot_unanswered_logging'), 'true') <> 'true' THEN RETURN; END IF;
  cleaned := left(trim(COALESCE(p_query, '')), 500);
  cleaned := regexp_replace(cleaned, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email removed]', 'g');
  cleaned := regexp_replace(cleaned, '(\+?[0-9][0-9 ()-]{7,}[0-9])', '[phone removed]', 'g');
  normalized := lower(regexp_replace(cleaned, '\s+', ' ', 'g'));
  IF char_length(normalized) < 3 THEN RETURN; END IF;
  INSERT INTO public.chatbot_unanswered (normalized_query, query_text)
  VALUES (normalized, cleaned)
  ON CONFLICT (normalized_query) DO UPDATE
    SET occurrences = public.chatbot_unanswered.occurrences + 1, last_asked_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.log_chatbot_unanswered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_chatbot_unanswered(text) TO anon, authenticated;

INSERT INTO public.chatbot_articles (question, answer, keywords, link_path, link_label, sort_order)
VALUES
('How does 11Drive work?', '11Drive helps car owners and ride-hailing drivers discover each other. Create a profile, browse suitable people or cars, send a connection request, and chat after the request is accepted.', ARRAY['how it works','marketplace','find driver','find car'], '/how-it-works', 'See how it works', 10),
('How do I create an account?', 'Choose Create account, select whether you are a driver or car owner, and complete the required details. Use a specific residential area rather than Kenya, Nairobi, or CBD alone.', ARRAY['register','registration','sign up','account'], '/register', 'Create an account', 20),
('How do connection requests work?', 'A car owner can connect with a driver, and a driver can connect with a car owner. The recipient can accept or reject the request, while the sender can cancel it while it is pending. Accepted connections can start a chat.', ARRAY['connection','connect','request','accept','reject','cancel'], '/help', 'Connection help', 30),
('How do vehicle listings work?', 'Car owners can add vehicles for admin review. Approved listings can appear in discovery. The normal listing limit is three vehicles; contact support if you need to list more.', ARRAY['vehicle','car listing','add car','limit','approval'], '/dashboard?tab=vehicles', 'Manage vehicles', 40),
('What is platform-history approval?', 'Drivers may submit platform-history evidence for admin review. Approval confirms only that the submitted history was reviewed; it is not identity verification or a safety guarantee.', ARRAY['platform history','document','verification','trust','approved'], '/help', 'Read trust guidance', 50),
('What happens when a document expires?', '11Drive can send in-app reminders and, when enabled, email reminders before and on expiry. Expired evidence is flagged for review and may affect listing visibility, but accounts and saved chats are not automatically deleted.', ARRAY['expired','expiry','document reminder','insurance'], '/dashboard', 'Open dashboard', 60),
('Can I share images in chat?', 'Connected users can exchange messages and supported attachments. You can preview an image before sending, open sent images at full size, and download shared images.', ARRAY['chat','message','image','attachment','download'], '/chat', 'Open chats', 70),
('How do promotions work?', 'An active promotion gives an eligible profile or vehicle extra visibility for the purchased period. When it expires, the promotion label and boosted reach end automatically while the normal listing remains.', ARRAY['promotion','promote','boost','reach','clicks'], '/dashboard', 'View promotions', 80),
('How can I stay safe?', 'Check the other member, documents, vehicle, insurance, and written terms yourself before paying or handing over a car. 11Drive connects members but does not insure vehicles or guarantee conduct.', ARRAY['safe','safety','scam','insurance','handover'], '/terms', 'Read responsibilities', 90),
('Does 11Drive handle payments?', 'No. 11Drive does not process payments between members. Agree payment and vehicle-handover terms directly and carefully with the other person.', ARRAY['payment','pay','money','deposit','fees'], '/terms', 'Read the terms', 100),
('How does 11Drive use my information?', '11Drive uses account, profile, listing, messaging, and limited analytics information to operate and improve the marketplace. Read the Privacy Policy for the current details and your choices.', ARRAY['privacy','data','information','analytics','location'], '/privacy', 'Read the Privacy Policy', 110),
('How do I contact support?', 'Use the Contact page to send 11Drive Support a message. Include the problem and relevant listing or account details, but never send a password or sensitive payment information.', ARRAY['support','contact','help','human','admin'], '/contact', 'Contact support', 120)
ON CONFLICT DO NOTHING;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chatbot_articles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
