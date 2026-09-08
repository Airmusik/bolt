ALTER TABLE reminder_private.event_email DROP CONSTRAINT IF EXISTS event_email_event_type_check;
ALTER TABLE reminder_private.event_email ADD CONSTRAINT event_email_event_type_check CHECK (event_type IN ('connection_accepted', 'message', 'admin_announcement', 'suspension'));

CREATE OR REPLACE FUNCTION public.admin_suspend_member(p_user_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE reason text:=COALESCE(NULLIF(trim(p_reason),''),'Violation of platform rules.');
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF char_length(reason)>1000 THEN RAISE EXCEPTION 'Suspension reason must be 1000 characters or fewer'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user_id AND role IN ('driver','owner')) THEN RAISE EXCEPTION 'Member not found'; END IF;
 UPDATE profiles SET is_suspended=true,suspension_reason=reason,suspended_at=now() WHERE id=p_user_id;
 INSERT INTO notifications(user_id,type,title,body,data) VALUES(p_user_id,'suspension','Account suspended','Your account has been suspended. Reason: '||reason,jsonb_build_object('path','/suspended','reason',reason));
END $$;
REVOKE ALL ON FUNCTION public.admin_suspend_member(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_member(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispatch_event_email(p_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,reminder_private,auth,vault,net AS $$
DECLARE q reminder_private.event_email%ROWTYPE;r record;api_key text;recipient text;sender_address text;site_url text;site_name text;actor_name text;heading text;email_message text;button_text text;path text;request bigint;reason text;
BEGIN
 FOR r IN SELECT e.id,e.attempts,e.first_attempt_at,h.status_code FROM reminder_private.event_email e JOIN net._http_response h ON h.id=e.request_id WHERE e.status='sending' AND (p_id IS NULL OR e.id=p_id) LOOP
  UPDATE reminder_private.event_email SET status=CASE WHEN r.status_code BETWEEN 200 AND 299 THEN 'accepted' WHEN (r.status_code IS NULL OR r.status_code=429 OR r.status_code>=500) AND r.attempts<5 AND r.first_attempt_at>now()-interval '23 hours' THEN 'queued' ELSE 'failed' END,next_attempt_at=CASE WHEN r.status_code BETWEEN 200 AND 299 THEN next_attempt_at ELSE now()+make_interval(mins=>power(2,r.attempts)::integer) END WHERE id=r.id;
 END LOOP;
 UPDATE reminder_private.event_email SET status=CASE WHEN attempts<5 AND first_attempt_at>now()-interval '23 hours' THEN 'queued' ELSE 'failed' END,next_attempt_at=now() WHERE status='sending' AND next_attempt_at<now()-interval '10 minutes' AND (p_id IS NULL OR id=p_id);
 SELECT from_email,c.site_url INTO sender_address,site_url FROM reminder_private.email_config c WHERE c.id;
 SELECT COALESCE(NULLIF(value,''),'11Drive') INTO site_name FROM site_settings WHERE key='site_name';
 SELECT btrim(decrypted_secret,E' \r\n\t') INTO api_key FROM vault.decrypted_secrets WHERE name='document_reminder_resend_key';
 IF NULLIF(api_key,'') IS NULL OR NULLIF(sender_address,'') IS NULL THEN RETURN;END IF;
 SELECT * INTO q FROM reminder_private.event_email WHERE status='queued' AND next_attempt_at<=now() AND (p_id IS NULL OR id=p_id) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF NOT FOUND THEN RETURN;END IF;
 SELECT email INTO recipient FROM auth.users WHERE id=q.user_id AND email_confirmed_at IS NOT NULL;
 IF NULLIF(recipient,'') IS NULL THEN UPDATE reminder_private.event_email SET status='cancelled' WHERE id=q.id;RETURN;END IF;
 IF q.event_type='connection_accepted' THEN
  SELECT p.full_name INTO actor_name FROM notifications n JOIN connections c ON c.id=(n.data->>'connection_id')::uuid JOIN profiles p ON p.id=CASE WHEN c.requester_id=q.user_id THEN c.recipient_id ELSE c.requester_id END WHERE n.id=q.notification_id;
  heading:='Connection accepted';email_message:=COALESCE(NULLIF(actor_name,''),'A member')||' accepted your connection request. You can now open '||site_name||' to view the connection and start chatting.';button_text:='View connection';path:='/dashboard?tab=connections';
 ELSIF q.event_type='suspension' THEN
  SELECT COALESCE(NULLIF(n.data->>'reason',''),'Violation of platform rules.') INTO reason FROM notifications n WHERE n.id=q.notification_id;
  heading:='Your account has been suspended';email_message:='Your '||site_name||' account has been suspended. Reason: '||reason||' If you believe this is incorrect, contact support for assistance.';button_text:='View account notice';path:='/suspended';
 ELSE
  SELECT p.full_name INTO actor_name FROM notifications n LEFT JOIN profiles p ON p.id=(n.data->>'sender_id')::uuid WHERE n.id=q.notification_id;
  heading:='You have a new message';email_message:=COALESCE(NULLIF(actor_name,''),'A member')||' sent you a new message on '||site_name||'. Open the conversation to read and reply.';button_text:='Open message';path:='/chat/'||COALESCE((SELECT data->>'conversation_id' FROM notifications WHERE id=q.notification_id),'');
 END IF;
 IF q.payload IS NULL THEN q.payload:=jsonb_build_object('from',site_name||' <'||sender_address||'>','to',jsonb_build_array(recipient),'subject',heading||' — '||site_name,'text',email_message||E'\n\n'||rtrim(site_url,'/')||path,'html',reminder_private.event_email_html(heading,email_message,button_text,path,site_name,site_url));
 ELSIF q.payload->'to' IS DISTINCT FROM jsonb_build_array(recipient) THEN UPDATE reminder_private.event_email SET status='cancelled' WHERE id=q.id;RETURN;END IF;
 SELECT net.http_post(url:='https://api.resend.com/emails',body:=q.payload,headers:=jsonb_build_object('Authorization','Bearer '||api_key,'Content-Type','application/json')) INTO request;
 UPDATE reminder_private.event_email SET status='sending',attempts=attempts+1,request_id=request,payload=q.payload,first_attempt_at=COALESCE(first_attempt_at,now()),next_attempt_at=now() WHERE id=q.id;
END $$;
REVOKE ALL ON FUNCTION public.dispatch_event_email(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION reminder_private.queue_event_email() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,reminder_private,auth AS $$
DECLARE queue_id uuid;recipient text;sender_address text;site_url text;site_name text;email_payload jsonb;
BEGIN
 IF NEW.type IN ('connection_accepted','message','suspension') THEN
  INSERT INTO reminder_private.event_email(notification_id,user_id,event_type) VALUES(NEW.id,NEW.user_id,NEW.type) ON CONFLICT(notification_id) DO NOTHING RETURNING id INTO queue_id;
 ELSIF NEW.type='admin_announcement' AND COALESCE((NEW.data->>'email')::boolean,false) THEN
  SELECT u.email INTO recipient FROM auth.users u WHERE u.id=NEW.user_id AND u.email_confirmed_at IS NOT NULL;
  SELECT c.from_email,c.site_url INTO sender_address,site_url FROM reminder_private.email_config c WHERE c.id;
  SELECT COALESCE(NULLIF(value,''),'11Drive') INTO site_name FROM public.site_settings WHERE key='site_name';
  IF NULLIF(recipient,'') IS NOT NULL AND NULLIF(sender_address,'') IS NOT NULL THEN
   email_payload:=jsonb_build_object('from',site_name||' <'||sender_address||'>','to',jsonb_build_array(recipient),'subject',NEW.title||' — '||site_name,'text',NEW.body||E'\n\n'||rtrim(site_url,'/')||'/notifications','html',reminder_private.event_email_html(NEW.title,NEW.body,'View update','/notifications',site_name,site_url));
   INSERT INTO reminder_private.event_email(notification_id,user_id,event_type,payload) VALUES(NEW.id,NEW.user_id,NEW.type,email_payload) ON CONFLICT(notification_id) DO NOTHING RETURNING id INTO queue_id;
  END IF;
 END IF;
 IF queue_id IS NOT NULL THEN PERFORM public.dispatch_event_email(queue_id);END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION reminder_private.queue_event_email() FROM PUBLIC,anon,authenticated;
