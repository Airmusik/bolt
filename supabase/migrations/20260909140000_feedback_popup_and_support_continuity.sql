-- First site feedback should not be hidden by a recent chat rating or account age.
-- Successful site ratings keep their monthly cooldown; chat ratings stay weekly.
CREATE OR REPLACE FUNCTION public.claim_experience_prompt(p_kind text,p_conversation_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.check_feedback_member(p_kind,p_conversation_id);
  PERFORM 1 FROM profiles WHERE id=auth.uid() FOR UPDATE;
  IF EXISTS(SELECT 1 FROM experience_prompt_state WHERE user_id=auth.uid() AND kind=p_kind AND next_prompt_at>now()) THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM experience_prompt_state WHERE user_id=auth.uid() AND prompted_at>now()-interval '1 day')
    AND (p_kind<>'site' OR EXISTS(SELECT 1 FROM experience_feedback WHERE user_id=auth.uid() AND kind='site')) THEN RETURN false; END IF;
  IF p_kind='chat' AND (SELECT count(*) FROM (SELECT 1 FROM messages WHERE conversation_id=p_conversation_id AND type<>'system' LIMIT 2) recent)<2 THEN RETURN false; END IF;
  INSERT INTO experience_prompt_state(user_id,kind,prompted_at,next_prompt_at)
    VALUES(auth.uid(),p_kind,now(),now()+CASE WHEN p_kind='chat' THEN interval '7 days' ELSE interval '30 days' END)
    ON CONFLICT(user_id,kind) DO UPDATE SET prompted_at=excluded.prompted_at,next_prompt_at=excluded.next_prompt_at;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_experience_prompt(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_experience_prompt(text,uuid) TO authenticated;

-- A previous inline banner was not a popup. Allow one real invitation for
-- members who saw that banner but have never submitted a site rating.
UPDATE public.experience_prompt_state p SET next_prompt_at=now(),prompted_at=now()-interval '2 days'
WHERE p.kind='site' AND NOT EXISTS(SELECT 1 FROM public.experience_feedback f WHERE f.user_id=p.user_id AND f.kind='site');

-- Both entry points must take the same per-member lock. Otherwise simultaneous
-- first messages from a member and an admin can create two support threads.
CREATE OR REPLACE FUNCTION public.admin_start_support_thread(p_user_id uuid,p_message text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE member public.profiles%ROWTYPE; thread uuid; content text:=trim(coalesce(p_message,''));
BEGIN
  IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF char_length(content)<5 OR char_length(content)>5000 THEN RAISE EXCEPTION 'Write a support message between 5 and 5000 characters'; END IF;
  SELECT * INTO member FROM profiles WHERE id=p_user_id AND role IN ('driver','owner');
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,71411));
  SELECT id INTO thread FROM contact_messages WHERE user_id=p_user_id ORDER BY updated_at DESC,created_at DESC LIMIT 1 FOR UPDATE;
  IF thread IS NOT NULL THEN
    INSERT INTO contact_message_entries(contact_message_id,sender_id,sender_role,body) VALUES(thread,auth.uid(),'admin',content);
  ELSE
    INSERT INTO contact_messages(user_id,name,email,message,status) VALUES(p_user_id,coalesce(nullif(trim(member.full_name),''),'Registered member'),coalesce(nullif(trim(member.email),''),'member@11drive.com'),content,'new') RETURNING id INTO thread;
  END IF;
  RETURN thread;
END $$;
REVOKE ALL ON FUNCTION public.admin_start_support_thread(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_start_support_thread(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
