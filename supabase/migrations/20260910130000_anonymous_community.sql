-- Anonymous to members, accountable to moderators. No auth IDs or raw contact
-- details are ever stored in the public/realtime message table.
CREATE SCHEMA IF NOT EXISTS operations_private;
REVOKE ALL ON SCHEMA operations_private FROM PUBLIC,anon,authenticated;
INSERT INTO public.site_settings(key,value) VALUES('community_enabled','false') ON CONFLICT(key) DO NOTHING;

CREATE TABLE operations_private.community_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE DEFAULT ('Member ' || substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  muted boolean NOT NULL DEFAULT false
);
CREATE TABLE public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL,
  member_role text NOT NULL CHECK(member_role IN ('driver','owner','admin')),
  body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed boolean NOT NULL DEFAULT false,
  filtered boolean NOT NULL DEFAULT false
);
CREATE INDEX community_messages_timeline ON public.community_messages(created_at DESC,id DESC);
CREATE TABLE operations_private.community_authors (
  message_id uuid PRIMARY KEY REFERENCES public.community_messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_author_rate ON operations_private.community_authors(user_id,created_at);
CREATE TABLE operations_private.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.community_messages(id),
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK(reason IN ('spam','abuse','personal_details','other')),
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(message_id,reporter_id)
);
CREATE TABLE operations_private.community_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL, message_id uuid, details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON operations_private.community_members,operations_private.community_authors,operations_private.community_reports,operations_private.community_actions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.community_filter(p_text text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $$
DECLARE clean text; words text; digit text; pair text;
BEGIN
  clean := translate(normalize(coalesce(p_text,''),NFKC),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹०१२३४५६७८९','012345678901234567890123456789');
  clean := regexp_replace(clean,U&'[\200B-\200F\202A-\202E\2060-\206F\FEFF\FE0F\20E3]','','g');
  -- No links/attachments: contact data in URL encodings or an image cannot be
  -- safely filtered as message text. Render only plain text in this room.
  clean := regexp_replace(clean,'(https?://|www\.)[^[:space:]]+','[Link removed]','gi');
  clean := regexp_replace(clean,'[[:alnum:]_.+%-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}','[Email removed]','gi');
  words := lower(clean);
  FOREACH pair IN ARRAY ARRAY['zero|oh|sifuri','one|moja','two|mbili','three|tatu','four|nne','five|tano','six|sita','seven|saba','eight|nane','nine|tisa'] LOOP
    digit := array_position(ARRAY['zero|oh|sifuri','one|moja','two|mbili','three|tatu','four|nne','five|tano','six|sita','seven|saba','eight|nane','nine|tisa'],pair)::text;
    words := regexp_replace(words,'\m(' || pair || ')\M',((digit::integer)-1)::text,'g');
  END LOOP;
  -- Mask the whole text when spelled digits reveal a number, avoiding offset
  -- mistakes that could leave part of a private number visible.
  IF words <> lower(clean) AND words ~ '[0-9]([^[:alnum:]]*[0-9]){6,}' THEN RETURN '[Phone number removed]'; END IF;
  clean := regexp_replace(clean,'\+?[0-9]([^[:alnum:]]*[0-9]){6,}','[Phone number removed]','g');
  IF clean ~ '[0-9OoIlL]([^[:alnum:]]*[0-9OoIlL]){6,}' AND regexp_replace(clean,'[^0-9]','','g') ~ '[0-9]{4}' THEN
    clean := regexp_replace(clean,'(?<![[:alnum:]])\+?[0-9OoIlL]([^[:alnum:]]*[0-9OoIlL]){6,}','[Phone number removed]','g');
  END IF;
  RETURN btrim(clean);
END $$;

CREATE FUNCTION public.community_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('driver','owner','admin') AND NOT coalesce(is_suspended,false))
 AND (coalesce(public.is_admin(),false) OR EXISTS(SELECT 1 FROM public.site_settings WHERE key='community_enabled' AND value='true'))
$$;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.community_messages TO authenticated;
CREATE POLICY community_read ON public.community_messages FOR SELECT TO authenticated USING(public.community_access());

CREATE FUNCTION public.community_session() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE member public.profiles; identity operations_private.community_members;
BEGIN
 SELECT * INTO member FROM public.profiles WHERE id=auth.uid() AND NOT coalesce(is_suspended,false) AND role IN ('driver','owner','admin');
 IF member.id IS NULL THEN RAISE EXCEPTION 'Sign in with an active member account.' USING ERRCODE='42501'; END IF;
 INSERT INTO operations_private.community_members(user_id) VALUES(member.id) ON CONFLICT DO NOTHING;
 SELECT * INTO identity FROM operations_private.community_members WHERE user_id=member.id;
 RETURN jsonb_build_object('enabled',EXISTS(SELECT 1 FROM site_settings WHERE key='community_enabled' AND value='true'),'alias',CASE WHEN member.role='admin' THEN 'Community moderator' ELSE identity.alias END,'role',member.role,'muted',identity.muted);
END $$;

CREATE FUNCTION public.community_page(p_before timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS SETOF public.community_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.community_access() THEN RAISE EXCEPTION 'Community chat is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT * FROM public.community_messages WHERE p_before IS NULL OR (created_at,id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)) ORDER BY created_at DESC,id DESC LIMIT 50;
END $$;

CREATE FUNCTION public.community_send(p_body text,p_client_id uuid) RETURNS public.community_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE session jsonb; safe text; sent public.community_messages;
BEGIN
 IF p_client_id IS NULL OR p_body IS NULL OR char_length(p_body)>1000 OR char_length(btrim(p_body))=0 THEN RAISE EXCEPTION 'Write a message between 1 and 1,000 characters.'; END IF;
 -- Shared settings lock makes the off switch authoritative for in-flight sends.
 PERFORM key FROM public.site_settings WHERE key='community_enabled' AND value='true' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Community chat is paused by the administrator.'; END IF;
 session := public.community_session();
 PERFORM pg_advisory_xact_lock(hashtextextended('community:'||auth.uid()::text,0));
 PERFORM user_id FROM community_members WHERE user_id=auth.uid() FOR SHARE;
 IF EXISTS(SELECT 1 FROM community_members WHERE user_id=auth.uid() AND muted) THEN RAISE EXCEPTION 'You are muted in community chat. Contact support for help.' USING ERRCODE='42501'; END IF;
 SELECT m.* INTO sent FROM community_messages m JOIN community_authors a ON a.message_id=m.id WHERE m.id=p_client_id AND a.user_id=auth.uid();
 IF FOUND THEN RETURN sent; END IF;
 IF EXISTS(SELECT 1 FROM community_authors WHERE user_id=auth.uid() AND created_at>clock_timestamp()-interval '3 seconds')
 OR (SELECT count(*) FROM community_authors WHERE user_id=auth.uid() AND created_at>clock_timestamp()-interval '1 minute')>=10 THEN RAISE EXCEPTION 'Please slow down. Wait a few seconds before sending again.'; END IF;
 safe := public.community_filter(p_body);
 IF safe='' OR safe IN ('[Phone number removed]','[Link removed]','[Email removed]') THEN RAISE EXCEPTION 'Phone numbers, email addresses and links are not allowed. Write a message without contact details.'; END IF;
 INSERT INTO community_messages(id,alias,member_role,body,filtered) VALUES(p_client_id,session->>'alias',session->>'role',safe,safe<>btrim(p_body)) RETURNING * INTO sent;
 INSERT INTO community_authors(message_id,user_id) VALUES(sent.id,auth.uid());
 RETURN sent;
END $$;

CREATE FUNCTION public.community_report(p_message_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
BEGIN
 IF NOT public.community_access() OR p_reason IS NULL OR p_reason NOT IN ('spam','abuse','personal_details','other') THEN RAISE EXCEPTION 'Cannot submit this report.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM community_messages WHERE id=p_message_id AND NOT removed AND member_role<>'admin') THEN RAISE EXCEPTION 'This message cannot be reported.'; END IF;
 IF EXISTS(SELECT 1 FROM community_authors WHERE message_id=p_message_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You cannot report your own message.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('community-report:'||auth.uid()::text,0));
 IF (SELECT count(*) FROM community_reports WHERE reporter_id=auth.uid() AND created_at>now()-interval '1 hour')>=10 THEN RAISE EXCEPTION 'Report limit reached. Please contact support.'; END IF;
 INSERT INTO community_reports(message_id,reporter_id,reason) VALUES(p_message_id,auth.uid(),p_reason) ON CONFLICT(message_id,reporter_id) DO NOTHING;
 IF FOUND AND (SELECT count(*) FROM community_reports WHERE message_id=p_message_id)=1 THEN
   INSERT INTO public.notifications(user_id,type,title,body,data)
   SELECT id,'community_report','Community message reported','A member flagged a message in the community. Review it in Community moderation.',jsonb_build_object('path','/admin?tab=community') FROM public.profiles WHERE role='admin' AND NOT coalesce(is_suspended,false);
 END IF;
END $$;

CREATE FUNCTION public.admin_community_overview() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('reports',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT m.id,m.alias,m.body,m.created_at,count(*)::int reports,array_agg(DISTINCT r.reason) reasons FROM community_reports r JOIN community_messages m ON m.id=r.message_id WHERE NOT r.resolved GROUP BY m.id ORDER BY min(r.created_at) LIMIT 100) x),'muted',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT alias FROM community_members WHERE muted ORDER BY alias LIMIT 100) x));
END $$;

CREATE FUNCTION public.admin_community_action(p_action text,p_message_id uuid DEFAULT NULL,p_alias text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE target uuid; old_body text;
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 IF p_action IN ('enable','disable') THEN
   UPDATE public.site_settings SET value=CASE WHEN p_action='enable' THEN 'true' ELSE 'false' END,updated_at=now() WHERE key='community_enabled';
 ELSIF p_action IN ('remove','resolve','mute') THEN
   SELECT a.user_id,m.body INTO target,old_body FROM community_messages m JOIN community_authors a ON a.message_id=m.id WHERE m.id=p_message_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Message not found.'; END IF;
   IF p_action='remove' THEN UPDATE community_messages SET removed=true,body='Message removed by a moderator.' WHERE id=p_message_id; END IF;
   IF p_action='mute' THEN
     IF target IS NULL OR EXISTS(SELECT 1 FROM profiles WHERE id=target AND role='admin') THEN RAISE EXCEPTION 'This member cannot be muted.'; END IF;
     UPDATE community_members SET muted=true WHERE user_id=target;
   END IF;
   UPDATE community_reports SET resolved=true WHERE message_id=p_message_id;
 ELSIF p_action='unmute' THEN
   UPDATE community_members SET muted=false WHERE alias=p_alias;
   IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;
 ELSE RAISE EXCEPTION 'Unknown community action.'; END IF;
 INSERT INTO community_actions(admin_id,action,message_id,details) VALUES(auth.uid(),p_action,p_message_id,jsonb_build_object('alias',p_alias,'previous_message',CASE WHEN p_action='remove' THEN old_body END));
END $$;

REVOKE ALL ON FUNCTION public.community_filter(text),public.community_access(),public.community_session(),public.community_page(timestamptz,uuid),public.community_send(text,uuid),public.community_report(uuid,text),public.admin_community_overview(),public.admin_community_action(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_access(),public.community_session(),public.community_page(timestamptz,uuid),public.community_send(text,uuid),public.community_report(uuid,text),public.admin_community_overview(),public.admin_community_action(text,uuid,text) TO authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
 END IF;
END $$;
