-- One rating per reviewer/member pair, across all connections and applications.
-- Existing records are retained; no reviews or ratings are deleted or rewritten.
CREATE UNIQUE INDEX reviews_one_per_member_pair ON public.reviews(reviewer_id,reviewee_id);

CREATE OR REPLACE FUNCTION public.submit_conversation_review(p_conversation_id uuid, p_rating integer, p_content text DEFAULT NULL)
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
  -- Serialize by member pair, including concurrent requests from different chats.
  PERFORM pg_advisory_xact_lock(hashtextextended('member-review:'||auth.uid()::text||':'||target::text,0));
  -- Reuse application reviews so the old and new entry points cannot double count.
  IF c.connection_id IS NULL AND c.application_id IS NOT NULL THEN
    SELECT * INTO result FROM reviews WHERE reviewee_id=target AND reviewer_id=auth.uid();
    IF FOUND THEN RETURN result; END IF;
    RETURN public.submit_review(c.application_id,p_rating,p_content);
  END IF;
  PERFORM 1 FROM connections WHERE id=c.connection_id AND status IN ('accepted','ended')
    AND ((requester_id=auth.uid() AND recipient_id=target) OR (recipient_id=auth.uid() AND requester_id=target)) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'An accepted connection is required before leaving a review'; END IF;
  SELECT * INTO result FROM reviews WHERE reviewee_id=target AND reviewer_id=auth.uid();
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
NOTIFY pgrst, 'reload schema';
