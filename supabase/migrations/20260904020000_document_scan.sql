BEGIN;
CREATE TABLE reminder_private.scan_state(id boolean PRIMARY KEY DEFAULT true CHECK(id), scanned_at timestamptz, report jsonb NOT NULL DEFAULT '[]');
INSERT INTO reminder_private.scan_state(id) VALUES(true);
CREATE FUNCTION public.refresh_document_scan() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE reminder_private.scan_state SET scanned_at=now(), report=(
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.expires_at NULLS FIRST),'[]') FROM (
 SELECT 'document:'||d.id AS source_key,p.id AS user_id,p.full_name,coalesce(d.label,replace(d.type,'_',' ')) AS label,d.created_at AS uploaded_at,(d.expiry_date+1)::timestamp AT TIME ZONE 'UTC' AS expires_at,'Uploaded'::text AS date_label FROM public.documents d JOIN public.profiles p ON p.id=d.user_id
 UNION ALL SELECT 'history:'||h.id,p.id,p.full_name,initcap(h.platform)||' platform history',h.created_at,h.expires_at,'Record created' FROM public.driver_platform_history h JOIN public.profiles p ON p.id=h.driver_id
 UNION ALL SELECT 'insurance:'||v.id,p.id,p.full_name,v.make||' '||v.model||' insurance',v.created_at,(v.insurance_expiry::date+1)::timestamp AT TIME ZONE 'UTC','Listing created' FROM public.vehicles v JOIN public.profiles p ON p.id=v.owner_id WHERE v.deleted_at IS NULL AND v.insurance_type<>'none'
 ) x);
$$;
REVOKE ALL ON FUNCTION public.refresh_document_scan() FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.admin_document_scan(p_run boolean DEFAULT false,p_auto boolean DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF p_auto IS NOT NULL THEN PERFORM cron.alter_job(jobid,active:=p_auto) FROM cron.job WHERE jobname='document-date-scan'; END IF;
 IF p_run THEN PERFORM public.refresh_document_scan(); END IF;
 RETURN (SELECT jsonb_build_object('scanned_at',scanned_at,'items',report,'automatic',coalesce((SELECT active FROM cron.job WHERE jobname='document-date-scan'),false)) FROM reminder_private.scan_state WHERE id);
END $$;
REVOKE ALL ON FUNCTION public.admin_document_scan(boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_document_scan(boolean,boolean) TO authenticated;
SELECT cron.schedule('document-date-scan','10 * * * *','SELECT public.refresh_document_scan()');
SELECT public.refresh_document_scan();
COMMIT;
