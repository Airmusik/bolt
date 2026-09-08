INSERT INTO public.site_settings(key,value) VALUES
('homepage_featured_cars','6'),('homepage_featured_drivers','4'),
('homepage_badge','Admin-reviewed driver history'),('homepage_heading_line_1','Find the right driver.'),('homepage_heading_line_2','Find the right car.'),('homepage_intro','Connect with car owners and ride-hailing drivers across Kenya. Compare platform history and reviews, then find your match.'),('maintenance_message','We''re making updates right now. Please check back soon.'),('registration_enabled','true'),('google_signin_enabled','true'),('new_listings_enabled','true'),('chat_images_enabled','true'),('connection_email_enabled','true'),('message_email_enabled','true'),('welcome_email_enabled','true'),('expiry_email_enabled','true'),('connection_limit_daily','30'),('upload_limit_mb','8'),('expiry_warning_days','30,7,1,0'),('auto_hide_expired_listings','false'),('required_phone','true'),('required_location','true'),('required_languages','true'),('support_hours','Monday–Friday, 8:00–17:00 EAT'),('support_auto_reply','Thanks for contacting 11Drive Support. We have received your message and will respond as soon as possible.'),('support_available','true'),('seo_home_title','11Drive — Find the Right Driver or the Right Car'),('seo_home_description','Find ride-hailing drivers and available cars across Kenya on 11Drive.'),('seo_keywords','drivers Kenya, cars for drivers, ride-hailing cars, car owners Kenya'),('email_welcome_subject','Welcome to 11Drive'),('email_connection_subject','You have a new connection request'),('email_message_subject','You have a new message on 11Drive'),('email_expiry_subject','A document needs your attention'),('analytics_retention_days','90'),('notification_retention_days','365'),('chat_retention_days','730') ON CONFLICT(key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.admin_settings_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,admin_id uuid,key text NOT NULL,old_value text,new_value text,changed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.admin_settings_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_settings_audit_read ON public.admin_settings_audit;
CREATE POLICY admin_settings_audit_read ON public.admin_settings_audit FOR SELECT TO authenticated USING(public.is_admin());
GRANT SELECT ON public.admin_settings_audit TO authenticated;
CREATE OR REPLACE FUNCTION public.audit_site_setting_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF OLD.value IS DISTINCT FROM NEW.value AND auth.uid() IS NOT NULL THEN INSERT INTO public.admin_settings_audit(admin_id,key,old_value,new_value) VALUES(auth.uid(),NEW.key,OLD.value,NEW.value); END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_audit_site_setting_change ON public.site_settings;
CREATE TRIGGER trg_audit_site_setting_change AFTER UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.audit_site_setting_change();

CREATE OR REPLACE FUNCTION reminder_private.apply_email_delivery_switch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,reminder_private AS $$
DECLARE enabled boolean;
BEGIN
 IF TG_TABLE_NAME='connection_email' THEN SELECT value='true' INTO enabled FROM public.site_settings WHERE key='connection_email_enabled';
 ELSE SELECT value='true' INTO enabled FROM public.site_settings WHERE key=CASE WHEN NEW.event_type='message' THEN 'message_email_enabled' ELSE 'connection_email_enabled' END; END IF;
 IF NOT coalesce(enabled,true) THEN RETURN NULL; END IF; RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_connection_email_switch ON reminder_private.connection_email;
CREATE TRIGGER trg_connection_email_switch BEFORE INSERT ON reminder_private.connection_email FOR EACH ROW EXECUTE FUNCTION reminder_private.apply_email_delivery_switch();
DROP TRIGGER IF EXISTS trg_event_email_switch ON reminder_private.event_email;
CREATE TRIGGER trg_event_email_switch BEFORE INSERT ON reminder_private.event_email FOR EACH ROW EXECUTE FUNCTION reminder_private.apply_email_delivery_switch();

CREATE OR REPLACE FUNCTION public.sync_expiry_email_switch() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,reminder_private AS $$ BEGIN IF NEW.key='expiry_email_enabled' THEN UPDATE reminder_private.email_config SET enabled=(NEW.value='true') WHERE id; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_sync_expiry_email_switch ON public.site_settings;
CREATE TRIGGER trg_sync_expiry_email_switch AFTER INSERT OR UPDATE ON public.site_settings FOR EACH ROW EXECUTE FUNCTION public.sync_expiry_email_switch();
