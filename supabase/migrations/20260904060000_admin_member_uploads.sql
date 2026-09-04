BEGIN;
ALTER TABLE public.driver_platform_history ADD COLUMN uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE POLICY admin_member_evidence_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='documents' AND public.is_admin());
CREATE FUNCTION public.admin_upload_member_evidence(p_user uuid,p_path text,p_kind text,p_label text,p_platform text,p_months integer,p_trips integer) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid; storage_path text:=split_part(p_path,'/storage/v1/object/public/documents/',2);
BEGIN
 IF auth.uid() IS NULL OR NOT is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND role IN ('driver','owner')) THEN RAISE EXCEPTION 'Member not found'; END IF;
 IF storage_path NOT LIKE p_user::text||'/admin-%' OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='documents' AND name=storage_path AND owner_id=auth.uid()::text) THEN RAISE EXCEPTION 'Upload a private file for this member first'; END IF;
 IF p_kind='platform' THEN
  IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=p_user AND role='driver') THEN RAISE EXCEPTION 'Platform history is for drivers only'; END IF;
  IF p_platform NOT IN ('uber','bolt','little','faras','other') OR p_months IS NULL OR p_months<1 OR p_trips IS NULL OR p_trips<0 THEN RAISE EXCEPTION 'Enter valid platform activity'; END IF;
  INSERT INTO driver_platform_history(driver_id,platform,months_active,trips,proof_url,approved,review_status,submitted_at,uploaded_by)
  VALUES(p_user,p_platform,p_months,p_trips,p_path,false,'pending',now(),auth.uid()) RETURNING id INTO result;
 ELSIF p_kind='other_trust_evidence' THEN
  IF length(trim(coalesce(p_label,'')))<3 OR length(p_label)>120 THEN RAISE EXCEPTION 'Enter a document label (3–120 characters)'; END IF;
  INSERT INTO documents(user_id,type,label,file_url,verified,rejected,uploaded_by) VALUES(p_user,p_kind,trim(p_label),p_path,false,false,auth.uid()) RETURNING id INTO result;
 ELSE RAISE EXCEPTION 'Invalid evidence type'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_upload_member_evidence(uuid,text,text,text,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upload_member_evidence(uuid,text,text,text,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
