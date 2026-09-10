-- Public identity is chosen before INSERT, so realtime never leaks the other
-- posting mode. Authentication and the private author audit remain unchanged.
ALTER TABLE public.community_messages DROP CONSTRAINT community_messages_member_role_check;
ALTER TABLE public.community_messages ADD CONSTRAINT community_messages_member_role_check
  CHECK(member_role IN ('driver','owner','admin','member'));
ALTER TABLE operations_private.community_members
  ADD COLUMN muted_until timestamptz,
  ADD COLUMN muted_reason text;

CREATE OR REPLACE FUNCTION public.community_session() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE member public.profiles; identity operations_private.community_members;
BEGIN
 SELECT * INTO member FROM public.profiles WHERE id=auth.uid() AND NOT coalesce(is_suspended,false) AND role IN ('driver','owner','admin');
 IF member.id IS NULL THEN RAISE EXCEPTION 'Sign in with an active member account.' USING ERRCODE='42501'; END IF;
 INSERT INTO operations_private.community_members(user_id) VALUES(member.id) ON CONFLICT DO NOTHING;
 SELECT * INTO identity FROM operations_private.community_members WHERE user_id=member.id;
 RETURN jsonb_build_object('enabled',EXISTS(SELECT 1 FROM site_settings WHERE key='community_enabled' AND value='true'),
   'alias',CASE WHEN member.role='admin' THEN 'Community moderator' ELSE identity.alias END,
   'member_alias',identity.alias,'role',member.role,
   'muted',identity.muted AND (identity.muted_until IS NULL OR identity.muted_until>clock_timestamp()),
   'muted_until',identity.muted_until,'muted_reason',identity.muted_reason);
END $$;

-- The default keeps existing two-argument clients working during rollout.
DROP FUNCTION public.community_send(text,uuid);
CREATE FUNCTION public.community_send(p_body text,p_client_id uuid,p_as_support boolean DEFAULT true) RETURNS public.community_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE session jsonb; safe text; sent public.community_messages; display_alias text; display_role text;
BEGIN
 IF p_client_id IS NULL OR p_body IS NULL OR char_length(p_body)>1000 OR char_length(btrim(p_body))=0 THEN RAISE EXCEPTION 'Write a message between 1 and 1,000 characters.'; END IF;
 PERFORM key FROM public.site_settings WHERE key='community_enabled' AND value='true' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Community chat is paused by the administrator.'; END IF;
 session := public.community_session();
 PERFORM pg_advisory_xact_lock(hashtextextended('community:'||auth.uid()::text,0));
 PERFORM user_id FROM community_members WHERE user_id=auth.uid() FOR SHARE;
 IF EXISTS(SELECT 1 FROM community_members WHERE user_id=auth.uid() AND muted AND (muted_until IS NULL OR muted_until>clock_timestamp())) THEN RAISE EXCEPTION 'You are muted in community chat. Contact support for help.' USING ERRCODE='42501'; END IF;
 SELECT m.* INTO sent FROM community_messages m JOIN community_authors a ON a.message_id=m.id WHERE m.id=p_client_id AND a.user_id=auth.uid();
 IF FOUND THEN RETURN sent; END IF;
 IF EXISTS(SELECT 1 FROM community_authors WHERE user_id=auth.uid() AND created_at>clock_timestamp()-interval '3 seconds')
 OR (SELECT count(*) FROM community_authors WHERE user_id=auth.uid() AND created_at>clock_timestamp()-interval '1 minute')>=10 THEN RAISE EXCEPTION 'Please slow down. Wait a few seconds before sending again.'; END IF;
 safe := public.community_filter(p_body);
 IF safe='' OR safe IN ('[Phone number removed]','[Link removed]','[Email removed]') THEN RAISE EXCEPTION 'Phone numbers, email addresses and links are not allowed. Write a message without contact details.'; END IF;
 display_alias := session->>'alias';
 display_role := session->>'role';
 IF display_role='admin' AND p_as_support IS FALSE THEN
   display_alias := session->>'member_alias';
   display_role := 'member';
 END IF;
 -- Non-admins cannot claim Support or supply somebody else's alias.
 INSERT INTO community_messages(id,alias,member_role,body,filtered) VALUES(p_client_id,display_alias,display_role,safe,safe<>btrim(p_body)) RETURNING * INTO sent;
 INSERT INTO community_authors(message_id,user_id) VALUES(sent.id,auth.uid());
 RETURN sent;
END $$;
REVOKE ALL ON FUNCTION public.community_session(),public.community_send(text,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_session(),public.community_send(text,uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_community_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('reports',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT m.id,m.alias,m.body,m.created_at,count(*)::int reports,array_agg(DISTINCT r.reason) reasons FROM community_reports r JOIN community_messages m ON m.id=r.message_id WHERE NOT r.resolved GROUP BY m.id ORDER BY min(r.created_at) LIMIT 100) x),
 'muted',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT alias,muted_until,muted_reason FROM community_members WHERE muted AND (muted_until IS NULL OR muted_until>clock_timestamp()) ORDER BY alias LIMIT 100) x));
END $$;

-- Default arguments preserve old clients' indefinite mute/unmute actions.
DROP FUNCTION public.admin_community_action(text,uuid,text);
CREATE FUNCTION public.admin_community_action(p_action text,p_message_id uuid DEFAULT NULL,p_alias text DEFAULT NULL,p_duration_hours integer DEFAULT NULL,p_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE target uuid; old_body text; expires timestamptz; reason text;
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 IF p_action IN ('enable','disable') THEN
   UPDATE public.site_settings SET value=CASE WHEN p_action='enable' THEN 'true' ELSE 'false' END,updated_at=now() WHERE key='community_enabled';
 ELSIF p_action IN ('remove','resolve','mute') THEN
   SELECT a.user_id,m.body INTO target,old_body FROM community_messages m JOIN community_authors a ON a.message_id=m.id WHERE m.id=p_message_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Message not found.'; END IF;
   IF p_action='remove' THEN UPDATE community_messages SET removed=true,body='Message removed by a moderator.' WHERE id=p_message_id; END IF;
   IF p_action='mute' THEN
     IF target IS NULL OR EXISTS(SELECT 1 FROM profiles WHERE id=target AND role='admin') THEN RAISE EXCEPTION 'This member cannot be banned.'; END IF;
     IF p_duration_hours IS NOT NULL AND (p_duration_hours<1 OR p_duration_hours>720) THEN RAISE EXCEPTION 'Choose a ban between 1 hour and 30 days, or until manually unbanned.'; END IF;
     reason := coalesce(p_reason,'Community rules violation');
     IF reason NOT IN ('Community rules violation','Spam or scams','Abusive or threatening messages','Sharing personal contact details','Repeated community rule violations') THEN RAISE EXCEPTION 'Choose a community rule violation.'; END IF;
     expires := CASE WHEN p_duration_hours IS NULL THEN NULL ELSE clock_timestamp()+make_interval(hours=>p_duration_hours) END;
     UPDATE community_members SET muted=true,muted_until=expires,muted_reason=reason WHERE user_id=target;
   END IF;
   UPDATE community_reports SET resolved=true WHERE message_id=p_message_id;
 ELSIF p_action='unmute' THEN
   UPDATE community_members SET muted=false,muted_until=NULL,muted_reason=NULL WHERE alias=p_alias;
   IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
 ELSE RAISE EXCEPTION 'Unknown community action.'; END IF;
 INSERT INTO community_actions(admin_id,action,message_id,details) VALUES(auth.uid(),p_action,p_message_id,jsonb_build_object('alias',p_alias,'previous_message',CASE WHEN p_action='remove' THEN old_body END,'ban_until',expires,'ban_reason',reason));
END $$;
REVOKE ALL ON FUNCTION public.admin_community_overview(),public.admin_community_action(text,uuid,text,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_community_overview(),public.admin_community_action(text,uuid,text,integer,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
