-- Close the access-control findings from the launch audit. No member data is deleted.

-- A table-wide grant overrides a private-column revoke. Keep the existing public
-- projection for compatibility, but remove all anonymous access to other columns.
REVOKE SELECT ON public.profiles FROM PUBLIC, anon;
DO $$ DECLARE col record; BEGIN
  FOR col IN SELECT attname FROM pg_attribute
    WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped
  LOOP EXECUTE format('REVOKE SELECT (%I) ON public.profiles FROM PUBLIC, anon',col.attname); END LOOP;
END $$;
GRANT SELECT(id,role,full_name,avatar_url,bio,location,preferred_locations,
  availability,languages,age,driving_experience_years,platforms_worked,
  licence_expiry,psv_badge_expiry,good_conduct_expiry,is_verified,verification_status,
  is_suspended,rating,rating_count,onboarding_completed,last_seen_at,created_at,updated_at,
  platform_history_approved,platform_history_submitted,platform_history_valid_until,
  document_listing_visibility) ON public.profiles TO anon;

-- New reports are allegations, not moderation decisions. This trigger also runs
-- inside the security-definer support-request RPC, where RLS alone is insufficient.
CREATE OR REPLACE FUNCTION public.guard_report_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.reporter_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You may only submit a report as yourself';
  END IF;
  IF NEW.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'New reports must await administrator review';
  END IF;
  NEW.created_at := now();
  IF NEW.target_type='conversation' AND NOT EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id=NEW.target_id
      AND c.driver_id IS NOT NULL AND c.owner_id IS NOT NULL
      AND auth.uid() IN (c.driver_id,c.owner_id)
      AND NEW.reported_id = CASE WHEN auth.uid()=c.driver_id THEN c.owner_id ELSE c.driver_id END
  ) THEN RAISE EXCEPTION 'Only a participant may report or request support for this chat'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_report_submission BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_report_submission();
DROP POLICY IF EXISTS reports_insert_own ON public.reports;
CREATE POLICY reports_insert_own ON public.reports FOR INSERT TO authenticated
  WITH CHECK(reporter_id=auth.uid() AND (status='open' OR public.is_admin()));

-- Conversation creation is done by the existing accepted-connection/application
-- RPCs. No UI uses direct inserts. Revoke the bypass entirely rather than trusting
-- caller-supplied member IDs, admin IDs, lifecycle fields or workflow references.
DROP POLICY IF EXISTS conv_insert_validated ON public.conversations;
REVOKE INSERT,UPDATE,DELETE ON public.conversations FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.conversation_admins FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS conversation_admins_join ON public.conversation_admins;

-- Definer helpers avoid circular policies between conversations, reports and
-- memberships. Every helper binds access to auth.uid(), never a supplied user ID.
CREATE OR REPLACE FUNCTION public.admin_can_access_conversation(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_admin() AND EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id=p_conversation_id AND (
      (c.admin_id=auth.uid() AND ((c.driver_id IS NULL) <> (c.owner_id IS NULL)))
      OR (c.driver_id IS NOT NULL AND c.owner_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.reports r WHERE r.target_type='conversation'
          AND r.target_id=c.id AND r.reason='Support requested'
          AND r.reporter_id IN (c.driver_id,c.owner_id)
          AND r.reported_id=CASE WHEN r.reporter_id=c.driver_id THEN c.owner_id ELSE c.driver_id END
          AND r.status IN ('open','reviewing','resolved')
      ))
    )
  );
$$;
CREATE OR REPLACE FUNCTION public.can_read_conversation(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id=p_conversation_id
      AND (auth.uid() IN (c.driver_id,c.owner_id) OR public.admin_can_access_conversation(c.id))
  );
$$;
DROP POLICY IF EXISTS conv_read_parties ON public.conversations;
CREATE POLICY conv_read_parties ON public.conversations FOR SELECT TO authenticated
  USING(public.can_read_conversation(id));
DROP POLICY IF EXISTS msg_read_parties ON public.messages;
CREATE POLICY msg_read_parties ON public.messages FOR SELECT TO authenticated
  USING(public.can_read_conversation(conversation_id));
DROP POLICY IF EXISTS msg_update_read_flag ON public.messages;
CREATE POLICY msg_update_read_flag ON public.messages FOR UPDATE TO authenticated
  USING(public.can_read_conversation(conversation_id))
  WITH CHECK(public.can_read_conversation(conversation_id));
DROP POLICY IF EXISTS conversation_admins_read ON public.conversation_admins;
CREATE POLICY conversation_admins_read ON public.conversation_admins FOR SELECT TO authenticated
  USING(public.can_read_conversation(conversation_id));

CREATE OR REPLACE FUNCTION public.can_send_to_conversation(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.conversations c WHERE c.id=p_conversation_id
      AND c.closed_at IS NULL AND public.can_read_conversation(c.id)
      AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND NOT p.is_suspended)
      AND (auth.uid() IN (c.driver_id,c.owner_id) OR (
        public.admin_can_access_conversation(c.id) AND (
          (c.admin_id=auth.uid() AND ((c.driver_id IS NULL) <> (c.owner_id IS NULL)))
          OR EXISTS(SELECT 1 FROM public.conversation_admins ca WHERE ca.conversation_id=c.id AND ca.admin_id=auth.uid())
        )
      ))
      AND NOT EXISTS (
        SELECT 1 FROM public.blocks b WHERE auth.uid() IN (c.driver_id,c.owner_id)
          AND ((b.blocker_id=c.driver_id AND b.blocked_id=c.owner_id)
            OR (b.blocker_id=c.owner_id AND b.blocked_id=c.driver_id))
      )
  );
$$;
CREATE OR REPLACE FUNCTION public.assert_can_send_to_conversation(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.conversations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.can_read_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'You do not have permission to send messages in this conversation';
  END IF;
  SELECT * INTO c FROM public.conversations WHERE id=p_conversation_id FOR UPDATE;
  IF c.closed_at IS NOT NULL THEN RAISE EXCEPTION 'This chat is read-only. Request support if it needs to be reopened.'; END IF;
  IF EXISTS(SELECT 1 FROM public.blocks b WHERE auth.uid() IN (c.driver_id,c.owner_id)
    AND ((b.blocker_id=c.driver_id AND b.blocked_id=c.owner_id) OR (b.blocker_id=c.owner_id AND b.blocked_id=c.driver_id)))
  THEN RAISE EXCEPTION 'Messaging is unavailable because one member blocked the other'; END IF;
  IF NOT public.can_send_to_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Messaging is unavailable. Support must join an invited chat before replying, and suspended accounts cannot send messages.';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid,p_content text)
RETURNS public.messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.messages%ROWTYPE;
BEGIN
  PERFORM public.assert_can_send_to_conversation(p_conversation_id);
  IF length(trim(COALESCE(p_content,'')))=0 THEN RAISE EXCEPTION 'Message cannot be empty'; END IF;
  IF length(trim(p_content))>1000 THEN RAISE EXCEPTION 'Message must be 1000 characters or fewer'; END IF;
  INSERT INTO public.messages(conversation_id,sender_id,content,type)
    VALUES(p_conversation_id,auth.uid(),trim(p_content),'text') RETURNING * INTO result;
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.send_chat_image(p_conversation_id uuid,p_path text)
RETURNS public.messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result public.messages%ROWTYPE; prefix text;
BEGIN
  PERFORM public.assert_can_send_to_conversation(p_conversation_id);
  prefix := p_conversation_id::text || '/' || auth.uid()::text || '/';
  IF p_path IS NULL OR length(p_path)>500 OR position('..' IN p_path)>0
    OR left(p_path,length(prefix))<>prefix OR right(lower(p_path),4)<>'.jpg'
  THEN RAISE EXCEPTION 'Invalid chat image path'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='chat-media'
    AND name=p_path AND owner_id=auth.uid()::text)
  THEN RAISE EXCEPTION 'Chat image upload was not found'; END IF;
  INSERT INTO public.messages(conversation_id,sender_id,content,type)
    VALUES(p_conversation_id,auth.uid(),p_path,'image') RETURNING * INTO result;
  RETURN result;
END $$;

-- Preserve the existing join/reopen/resolve behaviour behind a checked entry
-- point. Internal implementations are not callable through the public API.
ALTER FUNCTION public.admin_join_conversation(uuid) RENAME TO admin_join_conversation_internal;
CREATE FUNCTION public.admin_join_conversation(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.admin_can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Support has not been invited to this conversation';
  END IF;
  PERFORM public.admin_join_conversation_internal(p_conversation_id);
END $$;
ALTER FUNCTION public.admin_close_conversation_chat(uuid) RENAME TO admin_close_conversation_chat_internal;
CREATE FUNCTION public.admin_close_conversation_chat(p_conversation_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.admin_can_access_conversation(p_conversation_id) THEN
    RAISE EXCEPTION 'Support has not been invited to this conversation';
  END IF;
  RETURN public.admin_close_conversation_chat_internal(p_conversation_id);
END $$;
-- Rebind the compatibility resolver to the guarded entry point explicitly.
CREATE OR REPLACE FUNCTION public.admin_resolve_conversation_support(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN PERFORM public.admin_close_conversation_chat(p_conversation_id); END $$;
REVOKE ALL ON FUNCTION public.admin_join_conversation_internal(uuid),
  public.admin_close_conversation_chat_internal(uuid),public.assert_can_send_to_conversation(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_join_conversation(uuid),public.admin_close_conversation_chat(uuid),
  public.admin_can_access_conversation(uuid),public.can_read_conversation(uuid),
  public.can_send_to_conversation(uuid),public.send_message(uuid,text),public.send_chat_image(uuid,text)
  TO authenticated;

-- Read chat images under exactly the same invitation/member rules as messages.
DROP POLICY IF EXISTS chat_media_read_participants ON storage.objects;
CREATE POLICY chat_media_read_participants ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='chat-media' AND public.can_read_conversation(CASE
  WHEN (storage.foldername(objects.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN ((storage.foldername(objects.name))[1])::uuid ELSE NULL END));

DROP POLICY IF EXISTS contact_attachments_read_participants ON storage.objects;
CREATE POLICY contact_attachments_read_participants ON storage.objects FOR SELECT TO authenticated
USING(bucket_id='contact-attachments' AND EXISTS (
  SELECT 1 FROM public.contact_messages thread WHERE thread.id=CASE
    WHEN (storage.foldername(objects.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN ((storage.foldername(objects.name))[1])::uuid ELSE NULL END
    AND (thread.user_id=auth.uid() OR public.is_admin())
));
DROP POLICY IF EXISTS contact_attachments_upload_participants ON storage.objects;
CREATE POLICY contact_attachments_upload_participants ON storage.objects FOR INSERT TO authenticated
WITH CHECK(bucket_id='contact-attachments' AND (storage.foldername(objects.name))[2]=auth.uid()::text
  AND EXISTS(SELECT 1 FROM public.contact_messages thread WHERE thread.id=CASE
    WHEN (storage.foldername(objects.name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN ((storage.foldername(objects.name))[1])::uuid ELSE NULL END
    AND (thread.user_id=auth.uid() OR public.is_admin())
));

-- Old Supabase default grants made even mutation RPCs executable by anon.
-- Keep only the public discovery/signup/RLS helpers available while signed out.
DO $$ DECLARE fn record; BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS signature,p.proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon',fn.signature);
    IF fn.proname=ANY(ARRAY['active_promotion_targets','discover_drivers','discover_vehicles',
      'get_trust_passport','public_platform_history','check_registration_terms',
      'is_signup_phone_available','is_admin','shares_saved_chat']) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon',fn.signature);
    END IF;
  END LOOP;
END $$;
-- Internal rating/availability helpers must not be caller-controlled RPCs.
REVOKE EXECUTE ON FUNCTION public.recalculate_profile_rating(uuid),public.refresh_member_availability(uuid)
  FROM authenticated;

NOTIFY pgrst,'reload schema';
