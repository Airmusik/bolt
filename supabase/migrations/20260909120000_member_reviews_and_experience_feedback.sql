ALTER TABLE public.reviews ALTER COLUMN application_id DROP NOT NULL;
ALTER TABLE public.reviews ADD COLUMN connection_id uuid REFERENCES public.connections(id) ON DELETE CASCADE;
ALTER TABLE public.reviews ADD CONSTRAINT reviews_one_source CHECK (num_nonnulls(application_id, connection_id) = 1);
CREATE UNIQUE INDEX reviews_one_per_connection_party ON public.reviews(connection_id, reviewer_id) WHERE connection_id IS NOT NULL;

CREATE FUNCTION public.submit_conversation_review(p_conversation_id uuid, p_rating integer, p_content text DEFAULT NULL)
RETURNS public.reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.conversations%ROWTYPE; result public.reviews%ROWTYPE; target uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('driver','owner') AND NOT is_suspended) THEN RAISE EXCEPTION 'Sign in with an active member account'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Choose 1 to 5 stars'; END IF;
  IF length(coalesce(p_content,'')) > 2000 THEN RAISE EXCEPTION 'Keep your review within 2000 characters'; END IF;
  SELECT * INTO c FROM conversations WHERE id=p_conversation_id;
  IF NOT FOUND OR c.driver_id IS NULL OR c.owner_id IS NULL OR c.admin_id IS NOT NULL OR NOT (auth.uid() IN (c.driver_id,c.owner_id)) THEN RAISE EXCEPTION 'Only the two connected members can review each other'; END IF;
  target := CASE WHEN auth.uid()=c.driver_id THEN c.owner_id ELSE c.driver_id END;
  IF target=auth.uid() OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=target AND role IN ('driver','owner')) THEN RAISE EXCEPTION 'This is not a member-to-member conversation'; END IF;
  -- Reuse application reviews so the old and new entry points cannot double count.
  IF c.connection_id IS NULL AND c.application_id IS NOT NULL THEN
    SELECT * INTO result FROM reviews WHERE application_id=c.application_id AND reviewer_id=auth.uid();
    IF FOUND THEN RETURN result; END IF;
    RETURN public.submit_review(c.application_id,p_rating,p_content);
  END IF;
  PERFORM 1 FROM connections WHERE id=c.connection_id AND status IN ('accepted','ended')
    AND ((requester_id=auth.uid() AND recipient_id=target) OR (recipient_id=auth.uid() AND requester_id=target)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An accepted connection is required before leaving a review'; END IF;
  SELECT * INTO result FROM reviews WHERE connection_id=c.connection_id AND reviewer_id=auth.uid();
  IF FOUND THEN RETURN result; END IF;
  PERFORM 1 FROM profiles WHERE id=target FOR UPDATE;
  INSERT INTO reviews(connection_id,reviewer_id,reviewee_id,rating,content)
    VALUES(c.connection_id,auth.uid(),target,p_rating,nullif(trim(p_content),'')) RETURNING * INTO result;
  PERFORM public.recalculate_profile_rating(target);
  INSERT INTO notifications(user_id,type,title,body,data) VALUES(target,'review','You received a member review','A connected member shared their experience with you.',jsonb_build_object('path','/members/'||target::text));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.submit_conversation_review(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_conversation_review(uuid,integer,text) TO authenticated;

CREATE TABLE public.experience_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('site','chat')),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK(length(comment)<=2000),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  UNIQUE(user_id,request_id)
);
CREATE INDEX experience_feedback_created_idx ON public.experience_feedback(created_at DESC);
CREATE TABLE public.experience_prompt_state (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('site','chat')),
  prompted_at timestamptz NOT NULL DEFAULT now(),
  next_prompt_at timestamptz NOT NULL,
  PRIMARY KEY(user_id,kind)
);
ALTER TABLE public.experience_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_prompt_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY experience_feedback_read ON public.experience_feedback FOR SELECT TO authenticated USING(user_id=auth.uid() OR public.is_admin());
CREATE POLICY experience_prompt_own_read ON public.experience_prompt_state FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.experience_feedback,public.experience_prompt_state FROM anon,authenticated;
GRANT SELECT ON public.experience_feedback,public.experience_prompt_state TO authenticated;

CREATE FUNCTION public.check_feedback_member(p_kind text,p_conversation_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role IN ('driver','owner') AND NOT is_suspended) THEN RAISE EXCEPTION 'Sign in with an active member account'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('site','chat') THEN RAISE EXCEPTION 'Choose chat or site feedback'; END IF;
  IF p_kind='site' AND p_conversation_id IS NOT NULL THEN RAISE EXCEPTION 'Site feedback is not linked to a conversation'; END IF;
  IF p_kind='chat' AND NOT EXISTS(SELECT 1 FROM conversations WHERE id=p_conversation_id AND auth.uid() IN (driver_id,owner_id)) THEN RAISE EXCEPTION 'You can only rate your own chat experience'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.check_feedback_member(text,uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.claim_experience_prompt(p_kind text,p_conversation_id uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed integer;
BEGIN
  PERFORM public.check_feedback_member(p_kind,p_conversation_id);
  -- One atomic claim per member prevents simultaneous tabs from showing duplicates.
  PERFORM 1 FROM profiles WHERE id=auth.uid() FOR UPDATE;
  IF EXISTS(SELECT 1 FROM experience_prompt_state WHERE user_id=auth.uid() AND (next_prompt_at>now() AND kind=p_kind OR prompted_at>now()-interval '1 day')) THEN RETURN false; END IF;
  IF p_kind='site' AND EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND created_at>now()-interval '1 day') THEN RETURN false; END IF;
  IF p_kind='chat' AND (SELECT count(*) FROM messages WHERE conversation_id=p_conversation_id AND type<>'system')<2 THEN RETURN false; END IF;
  INSERT INTO experience_prompt_state(user_id,kind,prompted_at,next_prompt_at)
    VALUES(auth.uid(),p_kind,now(),now()+CASE WHEN p_kind='chat' THEN interval '7 days' ELSE interval '30 days' END)
    ON CONFLICT(user_id,kind) DO UPDATE SET prompted_at=excluded.prompted_at,next_prompt_at=excluded.next_prompt_at;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed=1;
END $$;

CREATE FUNCTION public.submit_experience_feedback(p_kind text,p_rating integer,p_comment text,p_request_id uuid,p_conversation_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
  PERFORM public.check_feedback_member(p_kind,p_conversation_id);
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Choose 1 to 5 stars'; END IF;
  IF p_request_id IS NULL OR length(coalesce(p_comment,''))>2000 THEN RAISE EXCEPTION 'Keep feedback within 2000 characters'; END IF;
  PERFORM 1 FROM profiles WHERE id=auth.uid() FOR UPDATE;
  SELECT id INTO result FROM experience_feedback WHERE user_id=auth.uid() AND request_id=p_request_id;
  IF FOUND THEN RETURN result; END IF;
  IF EXISTS(SELECT 1 FROM experience_feedback WHERE user_id=auth.uid() AND kind=p_kind AND created_at>now()-interval '5 minutes') THEN RAISE EXCEPTION 'Thanks for your feedback. Please wait a few minutes before sending another response.'; END IF;
  INSERT INTO experience_feedback(user_id,kind,conversation_id,rating,comment,request_id) VALUES(auth.uid(),p_kind,p_conversation_id,p_rating,trim(coalesce(p_comment,'')),p_request_id) RETURNING id INTO result;
  INSERT INTO experience_prompt_state(user_id,kind,prompted_at,next_prompt_at)
    VALUES(auth.uid(),p_kind,now(),now()+CASE WHEN p_kind='chat' THEN interval '7 days' ELSE interval '30 days' END)
    ON CONFLICT(user_id,kind) DO UPDATE SET prompted_at=excluded.prompted_at,next_prompt_at=excluded.next_prompt_at;
  RETURN result;
END $$;

CREATE FUNCTION public.admin_mark_feedback_reviewed(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  UPDATE experience_feedback SET reviewed_at=coalesce(reviewed_at,now()) WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_experience_prompt(text,uuid),public.submit_experience_feedback(text,integer,text,uuid,uuid),public.admin_mark_feedback_reviewed(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_experience_prompt(text,uuid),public.submit_experience_feedback(text,integer,text,uuid,uuid),public.admin_mark_feedback_reviewed(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
