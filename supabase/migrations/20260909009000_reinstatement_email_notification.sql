ALTER TABLE reminder_private.event_email DROP CONSTRAINT IF EXISTS event_email_event_type_check;
ALTER TABLE reminder_private.event_email ADD CONSTRAINT event_email_event_type_check
  CHECK (event_type IN ('connection_accepted','message','admin_announcement','suspension','reinstatement'));

CREATE OR REPLACE FUNCTION public.admin_reinstate_member(p_user_id uuid,p_message text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE message text:=NULLIF(trim(p_message),'');body text;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required';END IF;
 IF message IS NOT NULL AND char_length(message)>1000 THEN RAISE EXCEPTION 'Reinstatement message must be 1000 characters or fewer';END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user_id AND role IN ('driver','owner')) THEN RAISE EXCEPTION 'Member not found';END IF;
 body:='Your account access has been restored.'||CASE WHEN message IS NULL THEN ' You can sign in and continue using 11Drive.' ELSE ' Message from support: '||message END;
 UPDATE profiles SET is_suspended=false,suspension_reason=NULL,suspended_at=NULL WHERE id=p_user_id;
 INSERT INTO notifications(user_id,type,title,body,data) VALUES(p_user_id,'reinstatement','Account reinstated',body,jsonb_build_object('path','/dashboard','message',message));
END $$;
REVOKE ALL ON FUNCTION public.admin_reinstate_member(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_reinstate_member(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION reminder_private.queue_event_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,reminder_private,auth AS $$
DECLARE queue_id uuid;recipient text;sender_address text;site_url text;site_name text;email_payload jsonb;
BEGIN
 IF NEW.type IN ('connection_accepted','message','suspension') THEN
  INSERT INTO reminder_private.event_email(notification_id,user_id,event_type) VALUES(NEW.id,NEW.user_id,NEW.type) ON CONFLICT(notification_id) DO NOTHING RETURNING id INTO queue_id;
 ELSIF NEW.type IN ('admin_announcement','reinstatement') AND (NEW.type='reinstatement' OR COALESCE((NEW.data->>'email')::boolean,false)) THEN
  SELECT u.email INTO recipient FROM auth.users u WHERE u.id=NEW.user_id AND u.email_confirmed_at IS NOT NULL;
  SELECT c.from_email,c.site_url INTO sender_address,site_url FROM reminder_private.email_config c WHERE c.id;
  SELECT COALESCE(NULLIF(value,''),'11Drive') INTO site_name FROM public.site_settings WHERE key='site_name';
  IF NULLIF(recipient,'') IS NOT NULL AND NULLIF(sender_address,'') IS NOT NULL THEN
   email_payload:=jsonb_build_object('from',site_name||' <'||sender_address||'>','to',jsonb_build_array(recipient),'subject',NEW.title||' — '||site_name,'text',NEW.body||E'\n\n'||rtrim(site_url,'/')||COALESCE(NEW.data->>'path','/notifications'),'html',reminder_private.event_email_html(NEW.title,NEW.body,CASE WHEN NEW.type='reinstatement' THEN 'Return to your account' ELSE 'View update' END,COALESCE(NEW.data->>'path','/notifications'),site_name,site_url));
   INSERT INTO reminder_private.event_email(notification_id,user_id,event_type,payload) VALUES(NEW.id,NEW.user_id,NEW.type,email_payload) ON CONFLICT(notification_id) DO NOTHING RETURNING id INTO queue_id;
  END IF;
 END IF;
 IF queue_id IS NOT NULL THEN PERFORM public.dispatch_event_email(queue_id);END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION reminder_private.queue_event_email() FROM PUBLIC,anon,authenticated;
