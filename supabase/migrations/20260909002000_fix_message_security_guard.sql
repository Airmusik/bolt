CREATE OR REPLACE FUNCTION public.security_activity_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  recent_count integer;
  same_count integer;
  hourly_limit integer;
  minute_limit integer;
BEGIN
  IF TG_TABLE_NAME = 'connections' THEN
    actor := NEW.requester_id;
    IF public.security_setting_on('security_blocklist', true) AND EXISTS (
      SELECT 1 FROM security_blocks b JOIN profiles p ON p.id = actor
      WHERE b.active AND (b.expires_at IS NULL OR b.expires_at > now())
        AND ((b.kind = 'email' AND lower(b.value) = lower(p.email)) OR (b.kind = 'phone' AND b.value = p.phone))
    ) THEN RAISE EXCEPTION 'This account action is temporarily restricted. Contact support.'; END IF;
    SELECT count(*) INTO recent_count FROM connections
    WHERE requester_id = actor AND created_at > now() - interval '1 hour';
    hourly_limit := coalesce((SELECT value::int FROM site_settings WHERE key = 'security_connection_hourly_limit'), 20);
    IF recent_count >= greatest(hourly_limit, 1) THEN
      PERFORM add_security_event(actor, 'connection_rate', 'high', 'Unusually rapid connection requests', jsonb_build_object('count', recent_count));
      IF public.security_setting_on('security_rate_limits', true) THEN
        RAISE EXCEPTION 'Connection request limit reached. Please wait and try again.';
      END IF;
    END IF;
  ELSE
    actor := NEW.sender_id;
    IF public.security_setting_on('security_blocklist', true) AND EXISTS (
      SELECT 1 FROM security_blocks b JOIN profiles p ON p.id = actor
      WHERE b.active AND (b.expires_at IS NULL OR b.expires_at > now())
        AND ((b.kind = 'email' AND lower(b.value) = lower(p.email)) OR (b.kind = 'phone' AND b.value = p.phone))
    ) THEN RAISE EXCEPTION 'This account action is temporarily restricted. Contact support.'; END IF;
    SELECT count(*) INTO recent_count FROM messages
    WHERE sender_id = actor AND created_at > now() - interval '1 minute';
    minute_limit := coalesce((SELECT value::int FROM site_settings WHERE key = 'security_message_minute_limit'), 30);
    SELECT count(*) INTO same_count FROM messages
    WHERE sender_id = actor
      AND created_at > now() - interval '10 minutes'
      AND content = NEW.content
      AND length(coalesce(NEW.content, '')) > 0;
    IF same_count >= 4 AND public.security_setting_on('security_spam_detection', true) THEN
      PERFORM add_security_event(actor, 'message_spam', 'high', 'Repeated message content detected', jsonb_build_object('duplicates', same_count));
      RAISE EXCEPTION 'Repeated messages were paused. Please wait before trying again.';
    END IF;
    IF recent_count >= greatest(minute_limit, 1) THEN
      PERFORM add_security_event(actor, 'message_rate', 'high', 'Unusually rapid messaging detected', jsonb_build_object('count', recent_count));
      IF public.security_setting_on('security_rate_limits', true) THEN
        RAISE EXCEPTION 'Message limit reached. Please wait and try again.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
