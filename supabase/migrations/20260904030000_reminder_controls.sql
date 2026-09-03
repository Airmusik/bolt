BEGIN;
CREATE OR REPLACE FUNCTION public.document_expiry_items() RETURNS TABLE(source_key text,user_id uuid,vehicle_id uuid,label text,expires_at timestamptz,review_status text,visibility text,full_name text,role text,path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT 'history:'||h.id,p.id,NULL::uuid,initcap(h.platform)||' platform history',h.expires_at,h.review_status,p.document_listing_visibility,p.full_name,p.role,'/onboarding'
 FROM driver_platform_history h JOIN profiles p ON p.id=h.driver_id WHERE h.expires_at IS NOT NULL AND p.role='driver'
 UNION ALL
 SELECT 'document:'||d.id,p.id,d.vehicle_id,coalesce(d.label,replace(d.type,'_',' ')),(d.expiry_date+1)::timestamp AT TIME ZONE 'UTC',CASE WHEN d.rejected THEN 'rejected' WHEN d.verified THEN 'approved' ELSE 'pending' END,coalesce(v.document_listing_visibility,p.document_listing_visibility),p.full_name,p.role,CASE WHEN p.role='driver' THEN '/onboarding' ELSE '/contact' END
 FROM documents d JOIN profiles p ON p.id=d.user_id LEFT JOIN vehicles v ON v.id=d.vehicle_id WHERE d.expiry_date IS NOT NULL AND (d.vehicle_id IS NULL OR v.deleted_at IS NULL)
 UNION ALL
 SELECT 'insurance:'||v.id,p.id,v.id,v.make||' '||v.model||' insurance',(v.insurance_expiry::date+1)::timestamp AT TIME ZONE 'UTC','approved',v.document_listing_visibility,p.full_name,p.role,'/vehicles/'||v.id||'/edit'
 FROM vehicles v JOIN profiles p ON p.id=v.owner_id WHERE v.deleted_at IS NULL AND v.insurance_type<>'none' AND v.insurance_expiry IS NOT NULL;
$$;
CREATE FUNCTION public.admin_reminder_controls(p_auto boolean DEFAULT NULL,p_email boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF p_auto IS NOT NULL THEN PERFORM cron.alter_job(jobid,active:=p_auto) FROM cron.job WHERE jobname='document-expiry-reminders'; END IF;
 IF p_email IS NOT NULL THEN UPDATE reminder_private.email_config SET enabled=p_email WHERE id; END IF;
 RETURN jsonb_build_object('automatic',coalesce((SELECT active FROM cron.job WHERE jobname='document-expiry-reminders'),false),'email',coalesce((SELECT enabled FROM reminder_private.email_config WHERE id),false));
END $$;
CREATE FUNCTION public.admin_send_document_reminder(p_source text,p_email boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d record; v_milestone integer; delivery uuid;
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 SELECT * INTO d FROM public.document_expiry_items() WHERE source_key=p_source;
 IF NOT FOUND OR d.expires_at>now()+interval '30 days' THEN RAISE EXCEPTION 'Document is not expired or near expiry'; END IF;
 IF p_email AND NOT coalesce((SELECT enabled FROM reminder_private.email_config WHERE id),false) THEN RAISE EXCEPTION 'Enable reminder email delivery first'; END IF;
 IF p_email AND d.review_status='pending' THEN RAISE EXCEPTION 'Renewal is pending review. Send an in-app reminder only or review the renewal first.'; END IF;
 v_milestone:=CASE WHEN d.expires_at<=now() THEN 0 WHEN d.expires_at<=now()+interval '1 day' THEN 1 WHEN d.expires_at<=now()+interval '7 days' THEN 7 ELSE 30 END;
 INSERT INTO reminder_private.deliveries(source_key,user_id,expires_at,milestone,label,path,email_status)
 VALUES(d.source_key,d.user_id,d.expires_at,v_milestone,d.label,d.path,CASE WHEN p_email THEN 'queued' ELSE 'cancelled' END)
 ON CONFLICT(source_key,expires_at,milestone) DO NOTHING RETURNING id INTO delivery;
 IF delivery IS NULL THEN RETURN 'A reminder already exists for this expiry milestone. No duplicate was sent.'; END IF;
 INSERT INTO notifications(user_id,type,title,body,data) VALUES(d.user_id,'document_expiry','Document update reminder',d.label||CASE WHEN d.expires_at<=now() THEN ' has expired.' ELSE ' expires soon.' END||' Please review and update your document.',jsonb_build_object('path',d.path,'source_key',d.source_key,'expires_at',d.expires_at));
 RETURN CASE WHEN p_email THEN 'In-app notification sent; email queued for delivery.' ELSE 'In-app notification sent. No email queued.' END;
END $$;
REVOKE ALL ON FUNCTION public.admin_reminder_controls(boolean,boolean),public.admin_send_document_reminder(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reminder_controls(boolean,boolean),public.admin_send_document_reminder(text,boolean) TO authenticated;
COMMIT;
