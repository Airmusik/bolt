-- Real-time admin work notifications, private contact-message threads, and
-- an explicit owner resubmission workflow for rejected vehicle listings.

ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.contact_messages DROP CONSTRAINT IF EXISTS contact_messages_status_check;
ALTER TABLE public.contact_messages
  ADD CONSTRAINT contact_messages_status_check CHECK (status IN ('new', 'open', 'resolved'));

CREATE INDEX IF NOT EXISTS idx_contact_messages_user_updated
  ON public.contact_messages(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.contact_message_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_message_id uuid NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('guest', 'user', 'admin')),
  body text CHECK (body IS NULL OR char_length(trim(body)) BETWEEN 1 AND 5000),
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size integer CHECK (attachment_size IS NULL OR attachment_size BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (body IS NOT NULL OR attachment_path IS NOT NULL)
);

ALTER TABLE public.contact_message_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_contact_entries_thread_created
  ON public.contact_message_entries(contact_message_id, created_at);

INSERT INTO public.contact_message_entries (contact_message_id, sender_id, sender_role, body, created_at)
SELECT cm.id, cm.user_id, CASE WHEN cm.user_id IS NULL THEN 'guest' ELSE 'user' END, cm.message, cm.created_at
FROM public.contact_messages cm
WHERE NOT EXISTS (
  SELECT 1 FROM public.contact_message_entries entry WHERE entry.contact_message_id = cm.id
);

DROP POLICY IF EXISTS "contact_messages_submit" ON public.contact_messages;
CREATE POLICY "contact_messages_submit" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    status = 'new'
    AND resolved_at IS NULL
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "contact_messages_user_read" ON public.contact_messages;
CREATE POLICY "contact_messages_user_read" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "contact_entries_read_participants" ON public.contact_message_entries;
CREATE POLICY "contact_entries_read_participants" ON public.contact_message_entries
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.contact_messages thread
      WHERE thread.id = contact_message_id AND thread.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "contact_entries_insert_participants" ON public.contact_message_entries;
CREATE POLICY "contact_entries_insert_participants" ON public.contact_message_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (sender_role = 'admin' AND public.is_admin())
      OR (
        sender_role = 'user'
        AND EXISTS (
          SELECT 1 FROM public.contact_messages thread
          WHERE thread.id = contact_message_id AND thread.user_id = auth.uid()
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.create_contact_message_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contact_message_entries (contact_message_id, sender_id, sender_role, body, created_at)
  VALUES (
    NEW.id,
    NEW.user_id,
    CASE WHEN NEW.user_id IS NULL THEN 'guest' ELSE 'user' END,
    NEW.message,
    NEW.created_at
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_contact_message_entry ON public.contact_messages;
CREATE TRIGGER trg_create_contact_message_entry
AFTER INSERT ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.create_contact_message_entry();

CREATE OR REPLACE FUNCTION public.contact_entry_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread public.contact_messages%ROWTYPE;
  v_sender_name text;
BEGIN
  SELECT * INTO v_thread FROM public.contact_messages WHERE id = NEW.contact_message_id;

  UPDATE public.contact_messages
  SET updated_at = NEW.created_at,
      status = CASE WHEN NEW.sender_role = 'admin' THEN 'open' ELSE 'new' END,
      resolved_at = NULL
  WHERE id = NEW.contact_message_id;

  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = NEW.sender_id;

  IF NEW.sender_role IN ('user', 'guest') THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT admin.id,
           'support_message',
           CASE WHEN NEW.sender_role = 'guest' THEN 'New website message' ELSE 'New support message' END,
           COALESCE(v_sender_name, v_thread.name, 'A member') || ' sent a message to support.',
           jsonb_build_object('path', '/admin?tab=contact&message=' || NEW.contact_message_id::text, 'contact_message_id', NEW.contact_message_id)
    FROM public.profiles admin
    WHERE admin.role = 'admin' AND NOT admin.is_suspended;
  ELSIF NEW.sender_role = 'admin' AND v_thread.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      v_thread.user_id,
      'support_reply',
      'Support replied to your message',
      'You have a new reply from support.',
      jsonb_build_object('path', '/contact?message=' || NEW.contact_message_id::text, 'contact_message_id', NEW.contact_message_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_entry_activity ON public.contact_message_entries;
CREATE TRIGGER trg_contact_entry_activity
AFTER INSERT ON public.contact_message_entries
FOR EACH ROW EXECUTE FUNCTION public.contact_entry_activity();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contact-attachments',
  'contact-attachments',
  false,
  8388608,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "contact_attachments_read_participants" ON storage.objects;
CREATE POLICY "contact_attachments_read_participants" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contact-attachments'
    AND EXISTS (
      SELECT 1 FROM public.contact_messages thread
      WHERE thread.id = CASE
        WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END
      AND (thread.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "contact_attachments_upload_participants" ON storage.objects;
CREATE POLICY "contact_attachments_upload_participants" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contact-attachments'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.contact_messages thread
      WHERE thread.id = CASE
        WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN ((storage.foldername(name))[1])::uuid
        ELSE NULL
      END
      AND (thread.user_id = auth.uid() OR public.is_admin())
    )
  );

DROP POLICY IF EXISTS "contact_attachments_delete_own" ON storage.objects;
CREATE POLICY "contact_attachments_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'contact-attachments' AND (storage.foldername(name))[2] = auth.uid()::text);

CREATE OR REPLACE FUNCTION public.notify_admins_of_pending_listing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner_name text;
BEGIN
  IF NEW.approval_status = 'pending'
     AND (TG_OP = 'INSERT' OR OLD.approval_status IS DISTINCT FROM NEW.approval_status) THEN
    SELECT full_name INTO v_owner_name FROM public.profiles WHERE id = NEW.owner_id;
    INSERT INTO public.notifications (user_id, type, title, body, data)
    SELECT admin.id,
           'admin_listing_review',
           'Vehicle listing awaiting review',
           COALESCE(v_owner_name, 'A car owner') || ' submitted ' || NEW.year || ' ' || NEW.make || ' ' || NEW.model || '.',
           jsonb_build_object('path', '/admin?tab=cars', 'vehicle_id', NEW.id)
    FROM public.profiles admin
    WHERE admin.role = 'admin' AND NOT admin.is_suspended;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_pending_listing ON public.vehicles;
CREATE TRIGGER trg_notify_admins_pending_listing
AFTER INSERT OR UPDATE OF approval_status ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_of_pending_listing();

CREATE OR REPLACE FUNCTION public.resubmit_vehicle_listing(p_vehicle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles WHERE id = p_vehicle_id AND owner_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Vehicle listing not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicle_photos WHERE vehicle_id = p_vehicle_id AND NOT rejected
  ) THEN RAISE EXCEPTION 'Add at least one acceptable vehicle photo before resubmitting'; END IF;

  UPDATE public.vehicles
  SET approval_status = 'pending', approval_note = NULL, approved_at = NULL, approved_by = NULL
  WHERE id = p_vehicle_id AND owner_id = auth.uid() AND approval_status = 'rejected';
END;
$$;
REVOKE ALL ON FUNCTION public.resubmit_vehicle_listing(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubmit_vehicle_listing(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contact_messages'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_messages; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'contact_message_entries'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_message_entries; END IF;
END $$;

ALTER TABLE public.contact_messages REPLICA IDENTITY FULL;
ALTER TABLE public.contact_message_entries REPLICA IDENTITY FULL;
