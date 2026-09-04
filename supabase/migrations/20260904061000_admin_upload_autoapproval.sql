BEGIN;
ALTER FUNCTION public.admin_upload_member_evidence(uuid,text,text,text,text,integer,integer) RENAME TO admin_create_member_evidence;
REVOKE ALL ON FUNCTION public.admin_create_member_evidence(uuid,text,text,text,text,integer,integer) FROM authenticated;
CREATE FUNCTION public.admin_upload_member_evidence(p_user uuid,p_path text,p_kind text,p_label text,p_platform text,p_months integer,p_trips integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid; submitted timestamptz;
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 result:=admin_create_member_evidence(p_user,p_path,p_kind,p_label,p_platform,p_months,p_trips);
 IF p_kind='platform' THEN
  SELECT submitted_at INTO submitted FROM driver_platform_history WHERE id=result;
  PERFORM review_platform_history(result,'approved',NULL,submitted);
 ELSE
  UPDATE documents SET verified=true WHERE id=result;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_upload_member_evidence(uuid,text,text,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upload_member_evidence(uuid,text,text,text,text,integer,integer) TO authenticated;
CREATE FUNCTION public.guard_upload_attribution() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.is_admin() AND ((TG_OP='INSERT' AND NEW.uploaded_by IS NOT NULL) OR (TG_OP='UPDATE' AND NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by)) THEN RAISE EXCEPTION 'Only admin can set upload attribution'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_upload_attribution BEFORE INSERT OR UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_upload_attribution();
CREATE TRIGGER guard_upload_attribution BEFORE INSERT OR UPDATE ON public.driver_platform_history FOR EACH ROW EXECUTE FUNCTION public.guard_upload_attribution();
NOTIFY pgrst,'reload schema';
COMMIT;
