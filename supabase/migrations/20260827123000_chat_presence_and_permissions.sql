-- Reliable active-chat authorization plus lightweight member presence.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

ALTER TABLE public.profiles
  ALTER COLUMN last_seen_at SET DEFAULT now();

GRANT SELECT (last_seen_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_my_last_seen()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_seen_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.profiles SET last_seen_at = v_seen_at WHERE id = auth.uid();
  RETURN v_seen_at;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_my_last_seen() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_my_last_seen() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_send_to_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = p_conversation_id
      AND (
        (
          c.closed_at IS NULL
          AND (auth.uid() = c.driver_id OR auth.uid() = c.owner_id OR auth.uid() = c.admin_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.conversation_admins ca
          WHERE ca.conversation_id = c.id AND ca.admin_id = auth.uid()
        )
      )
      AND (
        (auth.uid() IS DISTINCT FROM c.driver_id AND auth.uid() IS DISTINCT FROM c.owner_id)
        OR NOT EXISTS (
          SELECT 1 FROM public.blocks b
          WHERE (b.blocker_id = c.driver_id AND b.blocked_id = c.owner_id)
             OR (b.blocker_id = c.owner_id AND b.blocked_id = c.driver_id)
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_send_to_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_to_conversation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_message(
  p_conversation_id uuid,
  p_content text
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.messages%ROWTYPE;
  v_conversation public.conversations%ROWTYPE;
  v_joined_admin boolean := false;
  v_direct_participant boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation not found'; END IF;

  v_direct_participant := auth.uid() = v_conversation.driver_id
    OR auth.uid() = v_conversation.owner_id
    OR auth.uid() = v_conversation.admin_id;
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_admins ca
    WHERE ca.conversation_id = p_conversation_id AND ca.admin_id = auth.uid()
  ) INTO v_joined_admin;

  IF NOT v_direct_participant AND NOT v_joined_admin THEN
    RAISE EXCEPTION 'You are not a participant in this conversation';
  END IF;

  IF v_conversation.closed_at IS NOT NULL AND NOT v_joined_admin THEN
    RAISE EXCEPTION 'This connection has ended. The chat is read-only; send and accept a new connection request to chat again.';
  END IF;

  IF auth.uid() IN (v_conversation.driver_id, v_conversation.owner_id)
     AND EXISTS (
       SELECT 1 FROM public.blocks b
       WHERE (b.blocker_id = v_conversation.driver_id AND b.blocked_id = v_conversation.owner_id)
          OR (b.blocker_id = v_conversation.owner_id AND b.blocked_id = v_conversation.driver_id)
     )
  THEN
    RAISE EXCEPTION 'Messaging is unavailable because one member blocked the other';
  END IF;

  IF length(trim(COALESCE(p_content, ''))) = 0 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  IF length(trim(p_content)) > 1000 THEN RAISE EXCEPTION 'Message must be 1000 characters or fewer'; END IF;

  INSERT INTO public.messages (conversation_id, sender_id, content, type)
  VALUES (p_conversation_id, auth.uid(), trim(p_content), 'text')
  RETURNING * INTO v_message;
  RETURN v_message;
END;
$$;
REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;
