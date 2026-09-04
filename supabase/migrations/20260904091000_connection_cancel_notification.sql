BEGIN;
CREATE FUNCTION public.notify_cancelled_connection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE sender_name text;
BEGIN
 IF OLD.status='pending' AND NEW.status='withdrawn' THEN
  SELECT full_name INTO sender_name FROM profiles WHERE id=NEW.requester_id;
  INSERT INTO notifications(user_id,type,title,body,data)
  VALUES(NEW.recipient_id,'connection_cancelled','Connection request cancelled',coalesce(nullif(sender_name,''),'The sender')||' cancelled their connection request.',jsonb_build_object('connection_id',NEW.id,'path','/dashboard?tab=connections'));
  UPDATE reminder_private.connection_email SET status='cancelled' WHERE id=NEW.id AND status='queued' AND attempts=0;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_cancelled_connection() FROM PUBLIC;
CREATE TRIGGER notify_cancelled_connection AFTER UPDATE OF status ON public.connections FOR EACH ROW EXECUTE FUNCTION public.notify_cancelled_connection();
COMMIT;
