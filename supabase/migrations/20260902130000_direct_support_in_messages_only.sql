-- Keep direct member/support conversations in the Messages inbox. Support Chats
-- is reserved for driver-owner conversations where support was invited.

ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS legacy_conversation_id uuid UNIQUE
    REFERENCES public.conversations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.enforce_contact_registered_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_email text;
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT full_name, email
    INTO v_name, v_email
    FROM public.profiles
    WHERE id = NEW.user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Registered support user not found';
    END IF;

    NEW.name := COALESCE(NULLIF(trim(v_name), ''), 'Registered member');
    NEW.email := COALESCE(NULLIF(trim(v_email), ''), NEW.email);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_contact_registered_identity ON public.contact_messages;
CREATE TRIGGER trg_enforce_contact_registered_identity
BEFORE INSERT OR UPDATE OF user_id, name, email ON public.contact_messages
FOR EACH ROW EXECUTE FUNCTION public.enforce_contact_registered_identity();

CREATE OR REPLACE FUNCTION public.create_contact_message_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_started boolean := false;
BEGIN
  v_admin_started := NEW.user_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND auth.uid() <> NEW.user_id
    AND public.is_admin();

  INSERT INTO public.contact_message_entries (contact_message_id, sender_id, sender_role, body, created_at)
  VALUES (
    NEW.id,
    CASE
      WHEN v_admin_started THEN auth.uid()
      ELSE NEW.user_id
    END,
    CASE
      WHEN v_admin_started THEN 'admin'
      WHEN NEW.user_id IS NULL THEN 'guest'
      ELSE 'user'
    END,
    NEW.message,
    NEW.created_at
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_start_support_thread(
  p_user_id uuid,
  p_message text DEFAULT 'Support opened this conversation to assist you.'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_thread_id uuid;
  v_message text := trim(COALESCE(p_message, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
    AND role IN ('driver', 'owner');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  IF char_length(v_message) < 5 OR char_length(v_message) > 5000 THEN
    RAISE EXCEPTION 'Support message must be between 5 and 5000 characters';
  END IF;

  SELECT id INTO v_thread_id
  FROM public.contact_messages
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_thread_id IS NOT NULL THEN
    RETURN v_thread_id;
  END IF;

  INSERT INTO public.contact_messages (user_id, name, email, message, status)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(v_profile.full_name), ''), 'Registered member'),
    COALESCE(NULLIF(trim(v_profile.email), ''), 'member@drivevell.local'),
    v_message,
    'new'
  )
  RETURNING id INTO v_thread_id;

  RETURN v_thread_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_start_support_thread(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_start_support_thread(uuid, text) TO authenticated;

-- Admins may only join a member-to-member conversation after one of its
-- participants has explicitly invited support through a support request.
CREATE OR REPLACE FUNCTION public.admin_join_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
  v_inserted integer;
  v_was_closed boolean;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF v_conversation.driver_id IS NULL OR v_conversation.owner_id IS NULL THEN
    RAISE EXCEPTION 'Direct support messages belong in Messages';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.reports report
    WHERE report.target_type = 'conversation'
      AND report.target_id = p_conversation_id
      AND report.reason = 'Support requested'
  ) THEN
    RAISE EXCEPTION 'Support has not been invited to this conversation';
  END IF;

  v_was_closed := v_conversation.closed_at IS NOT NULL;
  INSERT INTO public.conversation_admins (conversation_id, admin_id)
  VALUES (p_conversation_id, auth.uid())
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_was_closed THEN
    UPDATE public.conversations
    SET closed_at = NULL,
        closed_by = NULL,
        support_reopened_at = now(),
        support_reopened_by = auth.uid(),
        support_resolved_at = NULL,
        support_reopened_from_member_end = (
          v_conversation.admin_closed_at IS NULL
          AND v_conversation.closed_by IN (v_conversation.driver_id, v_conversation.owner_id)
        ),
        admin_closed_at = NULL,
        admin_closed_by = NULL
    WHERE id = p_conversation_id;

    INSERT INTO public.messages (conversation_id, sender_id, content, type)
    VALUES (
      p_conversation_id,
      auth.uid(),
      'Support reopened this ended chat. Both members can message again while the support session is active.',
      'system'
    );
  ELSIF v_inserted > 0 THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, type)
    VALUES (
      p_conversation_id,
      auth.uid(),
      'An administrator joined this conversation to provide support and help resolve concerns.',
      'system'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_join_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_join_conversation(uuid) TO authenticated;

-- Move legacy one-member/admin conversations into Messages. Triggers are
-- temporarily disabled so historical rows do not create duplicate entries or
-- send notifications during the migration.
ALTER TABLE public.contact_messages DISABLE TRIGGER trg_create_contact_message_entry;
ALTER TABLE public.contact_message_entries DISABLE TRIGGER trg_contact_entry_activity;

INSERT INTO public.contact_messages (
  user_id,
  name,
  email,
  message,
  status,
  created_at,
  updated_at,
  resolved_at,
  legacy_conversation_id
)
SELECT
  member.id,
  COALESCE(NULLIF(trim(member.full_name), ''), 'Registered member'),
  COALESCE(NULLIF(trim(member.email), ''), 'member@drivevell.local'),
  'Previous direct support conversation',
  CASE WHEN conversation.closed_at IS NULL THEN 'open' ELSE 'resolved' END,
  conversation.created_at,
  COALESCE(conversation.last_message_at, conversation.created_at),
  CASE WHEN conversation.closed_at IS NOT NULL THEN conversation.closed_at ELSE NULL END,
  conversation.id
FROM public.conversations conversation
JOIN public.profiles member
  ON member.id = COALESCE(conversation.driver_id, conversation.owner_id)
WHERE conversation.admin_id IS NOT NULL
  AND (
    (conversation.driver_id IS NOT NULL AND conversation.owner_id IS NULL)
    OR (conversation.owner_id IS NOT NULL AND conversation.driver_id IS NULL)
  )
ON CONFLICT (legacy_conversation_id) DO NOTHING;

INSERT INTO public.contact_message_entries (
  contact_message_id,
  sender_id,
  sender_role,
  body,
  created_at
)
SELECT
  thread.id,
  message.sender_id,
  CASE WHEN sender.role = 'admin' THEN 'admin' ELSE 'user' END,
  CASE
    WHEN message.type = 'image' THEN '[Image shared in the previous direct-support chat]'
    WHEN message.type = 'file' THEN '[File shared in the previous direct-support chat]'
    ELSE COALESCE(NULLIF(trim(message.content), ''), '[Message]')
  END,
  message.created_at
FROM public.messages message
JOIN public.contact_messages thread
  ON thread.legacy_conversation_id = message.conversation_id
JOIN public.profiles sender
  ON sender.id = message.sender_id
WHERE message.type <> 'system'
  AND NOT EXISTS (
    SELECT 1
    FROM public.contact_message_entries entry
    WHERE entry.contact_message_id = thread.id
      AND entry.sender_id = message.sender_id
      AND entry.created_at = message.created_at
  );

ALTER TABLE public.contact_message_entries ENABLE TRIGGER trg_contact_entry_activity;
ALTER TABLE public.contact_messages ENABLE TRIGGER trg_create_contact_message_entry;
