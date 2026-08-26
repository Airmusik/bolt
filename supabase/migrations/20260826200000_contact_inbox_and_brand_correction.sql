CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (char_length(trim(email)) BETWEEN 5 AND 254),
  message text NOT NULL CHECK (char_length(trim(message)) BETWEEN 5 AND 5000),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contact_messages_submit" ON public.contact_messages;
CREATE POLICY "contact_messages_submit" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'new' AND resolved_at IS NULL);

DROP POLICY IF EXISTS "contact_messages_admin_read" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_read" ON public.contact_messages
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "contact_messages_admin_update" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_update" ON public.contact_messages
  FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "contact_messages_admin_delete" ON public.contact_messages;
CREATE POLICY "contact_messages_admin_delete" ON public.contact_messages
  FOR DELETE TO authenticated USING (public.is_admin());

-- Let open sessions receive site-name and other setting changes without a refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'site_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.site_settings;
  END IF;
END $$;

-- Correct the previously misspelled default without overwriting a custom value.
UPDATE public.site_settings
SET value = 'airmusikinc@gmail.com', updated_at = now()
WHERE key = 'admin_contact_email' AND value = 'airmusikinck@gmail.com';
