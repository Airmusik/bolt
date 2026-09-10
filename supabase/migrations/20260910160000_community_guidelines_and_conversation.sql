ALTER TABLE operations_private.community_members ADD COLUMN rules_version text,
  ADD COLUMN rules_accepted_at timestamptz, ADD COLUMN reaction_updated_at timestamptz;
ALTER TABLE public.community_messages ADD COLUMN reply_to uuid REFERENCES public.community_messages(id),
  ADD COLUMN reactions jsonb NOT NULL DEFAULT '{}', ADD COLUMN pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN revision bigint NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX community_one_pin ON public.community_messages(pinned) WHERE pinned;
CREATE TABLE operations_private.community_reactions (
  message_id uuid NOT NULL REFERENCES public.community_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK(emoji IN ('👍','💡','👏','❤️')),
  PRIMARY KEY(message_id,user_id)
);
REVOKE ALL ON operations_private.community_reactions FROM PUBLIC,anon,authenticated;

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
   'muted_until',identity.muted_until,'muted_reason',identity.muted_reason,
   'rules_accepted',coalesce(identity.rules_version='2026-09-10',false),
   'rules_version','2026-09-10',
   'pinned_message',CASE WHEN public.community_access() THEN (SELECT to_jsonb(m) FROM community_messages m WHERE pinned AND NOT removed LIMIT 1) END);
END $$;

CREATE FUNCTION public.community_accept_rules(p_version text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
BEGIN
 PERFORM public.community_session();
 IF p_version IS DISTINCT FROM '2026-09-10' THEN RAISE EXCEPTION 'Please reload and read the latest community guidelines.'; END IF;
 UPDATE community_members SET rules_version=p_version,rules_accepted_at=clock_timestamp()
 WHERE user_id=auth.uid() AND rules_version IS DISTINCT FROM p_version;
END $$;

CREATE FUNCTION operations_private.community_require_posting() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE session jsonb;
BEGIN
 PERFORM key FROM public.site_settings WHERE key='community_enabled' AND value='true' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Community chat is paused by the administrator.'; END IF;
 session := public.community_session();
 PERFORM pg_advisory_xact_lock(hashtextextended('community:'||auth.uid()::text,0));
 PERFORM user_id FROM community_members WHERE user_id=auth.uid() FOR UPDATE;
 IF EXISTS(SELECT 1 FROM community_members WHERE user_id=auth.uid() AND muted AND (muted_until IS NULL OR muted_until>clock_timestamp())) THEN RAISE EXCEPTION 'You are muted in community chat. Contact support for help.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM community_members WHERE user_id=auth.uid() AND rules_version='2026-09-10') THEN RAISE EXCEPTION 'Read and accept the community guidelines before posting.' USING ERRCODE='42501'; END IF;
 RETURN session;
END $$;
REVOKE ALL ON FUNCTION operations_private.community_require_posting() FROM PUBLIC,anon,authenticated;

DROP FUNCTION public.community_send(text,uuid,boolean);
CREATE FUNCTION public.community_send(p_body text,p_client_id uuid,p_as_support boolean DEFAULT true,p_reply_to uuid DEFAULT NULL) RETURNS public.community_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE session jsonb; safe text; sent public.community_messages; display_alias text; display_role text;
BEGIN
 IF p_client_id IS NULL OR p_body IS NULL OR char_length(p_body)>1000 OR char_length(btrim(p_body))=0 THEN RAISE EXCEPTION 'Write a message between 1 and 1,000 characters.'; END IF;
 session := operations_private.community_require_posting();
 SELECT m.* INTO sent FROM community_messages m JOIN community_authors a ON a.message_id=m.id WHERE m.id=p_client_id AND a.user_id=auth.uid();
 IF FOUND THEN RETURN sent; END IF;
 IF p_reply_to IS NOT NULL THEN
   PERFORM id FROM community_messages WHERE id=p_reply_to AND NOT removed FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'That message is no longer available to reply to.'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM community_authors WHERE user_id=auth.uid() AND created_at>clock_timestamp()-interval '3 seconds')
 OR (SELECT count(*) FROM community_authors WHERE user_id=auth.uid() AND created_at>clock_timestamp()-interval '1 minute')>=10 THEN RAISE EXCEPTION 'Please slow down. Wait a few seconds before sending again.'; END IF;
 safe := public.community_filter(p_body);
 IF safe='' OR safe IN ('[Phone number removed]','[Link removed]','[Email removed]') THEN RAISE EXCEPTION 'Phone numbers, email addresses and links are not allowed. Write a message without contact details.'; END IF;
 display_alias := session->>'alias'; display_role := session->>'role';
 IF display_role='admin' AND p_as_support IS FALSE THEN display_alias:=session->>'member_alias'; display_role:='member'; END IF;
 INSERT INTO community_messages(id,alias,member_role,body,filtered,reply_to) VALUES(p_client_id,display_alias,display_role,safe,safe<>btrim(p_body),p_reply_to) RETURNING * INTO sent;
 INSERT INTO community_authors(message_id,user_id) VALUES(sent.id,auth.uid());
 RETURN sent;
END $$;

CREATE FUNCTION public.community_my_reactions(p_ids uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
BEGIN
 IF NOT public.community_access() OR coalesce(cardinality(p_ids),0)>100 THEN RAISE EXCEPTION 'Community chat is unavailable.' USING ERRCODE='42501'; END IF;
 RETURN (SELECT coalesce(jsonb_object_agg(message_id,emoji),'{}') FROM community_reactions WHERE user_id=auth.uid() AND message_id=ANY(p_ids));
END $$;
CREATE FUNCTION public.community_react(p_message_id uuid,p_emoji text DEFAULT NULL) RETURNS public.community_messages LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE previous text; updated public.community_messages;
BEGIN
 PERFORM operations_private.community_require_posting();
 IF p_emoji IS NOT NULL AND p_emoji NOT IN ('👍','💡','👏','❤️') THEN RAISE EXCEPTION 'Choose one of the community reactions.'; END IF;
 PERFORM id FROM community_messages WHERE id=p_message_id AND NOT removed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'That message is no longer available to react to.'; END IF;
 SELECT emoji INTO previous FROM community_reactions WHERE message_id=p_message_id AND user_id=auth.uid();
 IF previous IS NOT DISTINCT FROM p_emoji THEN SELECT * INTO updated FROM community_messages WHERE id=p_message_id; RETURN updated; END IF;
 IF EXISTS(SELECT 1 FROM community_members WHERE user_id=auth.uid() AND reaction_updated_at>clock_timestamp()-interval '1 second') THEN RAISE EXCEPTION 'Please wait a moment before reacting again.'; END IF;
 IF p_emoji IS NULL THEN DELETE FROM community_reactions WHERE message_id=p_message_id AND user_id=auth.uid();
 ELSE INSERT INTO community_reactions(message_id,user_id,emoji) VALUES(p_message_id,auth.uid(),p_emoji) ON CONFLICT(message_id,user_id) DO UPDATE SET emoji=excluded.emoji; END IF;
 UPDATE community_members SET reaction_updated_at=clock_timestamp() WHERE user_id=auth.uid();
 SELECT * INTO updated FROM community_messages WHERE id=p_message_id;
 RETURN updated;
END $$;

CREATE FUNCTION public.community_pin(p_message_id uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
BEGIN
 IF NOT coalesce(public.is_admin(),false) THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('community-pin',0));
 IF p_message_id IS NOT NULL THEN
   PERFORM id FROM community_messages WHERE id=p_message_id AND NOT removed FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'That message is no longer available to pin.'; END IF;
 END IF;
 UPDATE community_messages SET pinned=false WHERE pinned;
 IF p_message_id IS NOT NULL THEN UPDATE community_messages SET pinned=true WHERE id=p_message_id AND NOT removed; END IF;
 INSERT INTO community_actions(admin_id,action,message_id) VALUES(auth.uid(),'pin',p_message_id);
END $$;
CREATE FUNCTION operations_private.community_hide_removed_extras() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 NEW.revision:=OLD.revision+1;
 IF NEW.removed THEN NEW.pinned:=false; NEW.reactions:='{}'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER community_hide_removed_extras BEFORE UPDATE ON public.community_messages FOR EACH ROW EXECUTE FUNCTION operations_private.community_hide_removed_extras();
REVOKE ALL ON FUNCTION operations_private.community_hide_removed_extras() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION operations_private.community_reaction_totals() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,operations_private,pg_temp AS $$
DECLARE target uuid;
BEGIN
 target:=CASE WHEN TG_OP='DELETE' THEN OLD.message_id ELSE NEW.message_id END;
 UPDATE community_messages SET reactions=(SELECT coalesce(jsonb_object_agg(emoji,n),'{}') FROM (SELECT emoji,count(*) n FROM community_reactions WHERE message_id=target GROUP BY emoji) x) WHERE id=target;
 RETURN NULL;
END $$;
CREATE TRIGGER community_reaction_totals AFTER INSERT OR UPDATE OR DELETE ON operations_private.community_reactions FOR EACH ROW EXECUTE FUNCTION operations_private.community_reaction_totals();
REVOKE ALL ON FUNCTION operations_private.community_reaction_totals() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.community_accept_rules(text),public.community_send(text,uuid,boolean,uuid),public.community_my_reactions(uuid[]),public.community_react(uuid,text),public.community_pin(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.community_accept_rules(text),public.community_send(text,uuid,boolean,uuid),public.community_my_reactions(uuid[]),public.community_react(uuid,text),public.community_pin(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
