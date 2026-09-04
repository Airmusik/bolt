BEGIN;
ALTER TABLE contact_message_entries ADD COLUMN delivered_at timestamptz, ADD COLUMN read_at timestamptz, ADD COLUMN unsent_at timestamptz;
ALTER TABLE messages ADD COLUMN delivered_at timestamptz;
CREATE FUNCTION public.mark_support_receipt(p_thread uuid,p_read boolean,p_through timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM contact_messages WHERE id=p_thread AND (user_id=auth.uid() OR is_admin())) THEN RAISE EXCEPTION 'Access denied'; END IF;
 UPDATE contact_message_entries SET delivered_at=coalesce(delivered_at,now()),read_at=CASE WHEN p_read THEN coalesce(read_at,now()) ELSE read_at END
 WHERE contact_message_id=p_thread AND created_at<=p_through AND unsent_at IS NULL AND
 ((is_admin() AND sender_role<>'admin') OR (NOT is_admin() AND sender_role='admin')) AND (delivered_at IS NULL OR (p_read AND read_at IS NULL));
END $$;
CREATE FUNCTION public.admin_unsend_support_message(p_entry uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE thread uuid; original text;
BEGIN
 IF NOT is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 SELECT contact_message_id,body INTO thread,original FROM contact_message_entries WHERE id=p_entry AND sender_role='admin' AND sender_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Only your own support messages can be unsent'; END IF;
 UPDATE contact_message_entries SET body='Message removed by support',attachment_path=NULL,attachment_name=NULL,attachment_type=NULL,attachment_size=NULL,unsent_at=now() WHERE id=p_entry AND unsent_at IS NULL;
 UPDATE contact_messages SET message='Message removed by support' WHERE id=thread AND message=original;
END $$;
CREATE FUNCTION public.mark_chat_delivered() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE messages m SET delivered_at=now() WHERE m.sender_id<>auth.uid() AND m.delivered_at IS NULL AND EXISTS(SELECT 1 FROM conversations c WHERE c.id=m.conversation_id AND auth.uid() IN(c.driver_id,c.owner_id,c.admin_id));
$$;
REVOKE ALL ON FUNCTION public.mark_support_receipt(uuid,boolean,timestamptz),public.admin_unsend_support_message(uuid),public.mark_chat_delivered() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_support_receipt(uuid,boolean,timestamptz),public.admin_unsend_support_message(uuid),public.mark_chat_delivered() TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_start_support_thread(p_user_id uuid,p_message text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE member public.profiles%ROWTYPE; thread uuid; content text:=trim(coalesce(p_message,''));
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF char_length(content)<5 OR char_length(content)>5000 THEN RAISE EXCEPTION 'Write a support message between 5 and 5000 characters'; END IF;
 SELECT * INTO member FROM profiles WHERE id=p_user_id AND role IN ('driver','owner');
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 SELECT id INTO thread FROM contact_messages WHERE user_id=p_user_id ORDER BY updated_at DESC LIMIT 1;
 IF thread IS NOT NULL THEN
  INSERT INTO contact_message_entries(contact_message_id,sender_id,sender_role,body) VALUES(thread,auth.uid(),'admin',content);
 ELSE
  INSERT INTO contact_messages(user_id,name,email,message,status) VALUES(p_user_id,coalesce(nullif(trim(member.full_name),''),'Registered member'),coalesce(nullif(trim(member.email),''),'member@11drive.com'),content,'new') RETURNING id INTO thread;
 END IF;
 RETURN thread;
END $$;
COMMIT;
