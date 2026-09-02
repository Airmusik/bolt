CREATE SCHEMA IF NOT EXISTS reminder_private;
REVOKE ALL ON SCHEMA reminder_private FROM PUBLIC,anon,authenticated;

CREATE TABLE reminder_private.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  milestone integer NOT NULL CHECK(milestone IN (30,7,1,0)),
  label text NOT NULL,
  path text NOT NULL,
  email_status text NOT NULL DEFAULT 'queued' CHECK(email_status IN ('queued','sending','accepted','failed','cancelled')),
  request_id bigint,
  attempts integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  email_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_key,expires_at,milestone)
);
CREATE TABLE reminder_private.email_config (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  enabled boolean NOT NULL DEFAULT false,
  from_email text,
  site_url text NOT NULL DEFAULT 'https://bolt-phi-indol.vercel.app',
  CHECK(site_url ~ '^https://[^[:space:]]+$')
);
INSERT INTO reminder_private.email_config(id) VALUES(true);

-- Internal projection used by both the admin queue and the reminder scheduler.
CREATE FUNCTION public.document_expiry_items() RETURNS TABLE(source_key text,user_id uuid,vehicle_id uuid,label text,expires_at timestamptz,review_status text,visibility text,full_name text,role text,path text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT 'history:'||h.id,p.id,NULL::uuid,initcap(h.platform)||' platform history',h.expires_at,h.review_status,p.document_listing_visibility,p.full_name,p.role,'/onboarding'
    FROM public.driver_platform_history h JOIN public.profiles p ON p.id=h.driver_id WHERE h.expires_at IS NOT NULL AND p.role='driver'
  UNION ALL
  SELECT 'document:'||d.id,p.id,d.vehicle_id,COALESCE(d.label,replace(d.type,'_',' ')),(d.expiry_date+1)::timestamp AT TIME ZONE 'UTC',
    CASE WHEN d.rejected THEN 'rejected' WHEN d.verified THEN 'approved' ELSE 'pending' END,
    COALESCE(v.document_listing_visibility,p.document_listing_visibility),p.full_name,p.role,
    CASE WHEN p.role='driver' THEN '/onboarding' ELSE '/contact' END
    FROM public.documents d JOIN public.profiles p ON p.id=d.user_id LEFT JOIN public.vehicles v ON v.id=d.vehicle_id
    WHERE d.type IN ('work_history','other_trust_evidence') AND d.expiry_date IS NOT NULL AND (d.vehicle_id IS NULL OR v.deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.document_expiry_items() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_expired_documents() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.expires_at),'[]'::jsonb) FROM public.document_expiry_items() d WHERE d.expires_at<=now() OR d.visibility<>'public');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_expired_documents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_expired_documents() TO authenticated;

CREATE FUNCTION public.process_document_expiry_reminders() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; v_milestone integer; v_id uuid; v_body text; v_count integer:=0;
BEGIN
  -- Refresh cached badges; permission checks also compare expiry in real time.
  PERFORM set_config('app.profile_system_update','on',true);
  UPDATE public.profiles p SET platform_history_approved=false,platform_history_submitted=false
    WHERE p.role='driver' AND p.platform_history_approved AND NOT EXISTS(SELECT 1 FROM public.driver_platform_history h WHERE h.driver_id=p.id AND h.review_status='approved' AND h.approved AND h.expires_at>now());
  UPDATE public.profiles SET is_verified=false,verification_status=CASE WHEN platform_history_submitted THEN 'pending' ELSE 'unverified' END WHERE role='driver' AND NOT platform_history_approved AND is_verified;
  PERFORM set_config('app.profile_system_update','off',true);
  -- Cancel mail not yet sent for superseded documents or submitted renewals.
  UPDATE reminder_private.deliveries q SET email_status='cancelled' WHERE q.email_status='queued' AND NOT EXISTS(
    SELECT 1 FROM public.document_expiry_items() current_doc WHERE current_doc.source_key=q.source_key AND current_doc.expires_at=q.expires_at AND current_doc.review_status<>'pending'
      AND q.milestone=CASE WHEN current_doc.expires_at<=now() THEN 0 WHEN current_doc.expires_at<=now()+interval '1 day' THEN 1 WHEN current_doc.expires_at<=now()+interval '7 days' THEN 7 ELSE 30 END);
  FOR d IN SELECT * FROM public.document_expiry_items() WHERE expires_at<=now()+interval '30 days' AND review_status<>'pending' LOOP
    v_milestone:=CASE WHEN d.expires_at<=now() THEN 0 WHEN d.expires_at<=now()+interval '1 day' THEN 1 WHEN d.expires_at<=now()+interval '7 days' THEN 7 ELSE 30 END;
    v_id:=NULL;
    INSERT INTO reminder_private.deliveries(source_key,user_id,expires_at,milestone,label,path) VALUES(d.source_key,d.user_id,d.expires_at,v_milestone,d.label,d.path)
      ON CONFLICT(source_key,expires_at,milestone) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN CONTINUE; END IF;
    v_body:=CASE WHEN v_milestone=0 THEN d.label||' expired. Submit updated proof now to avoid your listing being made private or removed by an administrator. If you have uploaded a draft, remember to submit it for review.'
      ELSE d.label||' expires on '||to_char(d.expires_at AT TIME ZONE 'Africa/Nairobi','DD Mon YYYY HH24:MI')||' EAT. Prepare your latest proof. Renewal opens when the current approval expires; submit it promptly then to avoid your listing being made private or removed.' END;
    INSERT INTO public.notifications(user_id,type,title,body,data) VALUES(d.user_id,'document_expiry',CASE WHEN v_milestone=0 THEN 'Document expired — update required' ELSE 'Document expiry reminder' END,v_body,jsonb_build_object('path',d.path,'expires_at',d.expires_at,'source_key',d.source_key));
    IF v_milestone=0 THEN
      INSERT INTO public.notifications(user_id,type,title,body,data) SELECT id,'document_expiry','Expired document needs attention',d.full_name||': '||d.label||' has expired. Review the listing and contact the member.',jsonb_build_object('path','/admin?tab=expired') FROM public.profiles WHERE role='admin' AND NOT is_suspended;
    END IF;
    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.process_document_expiry_reminders() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.admin_document_email_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN jsonb_build_object('enabled',(SELECT enabled FROM reminder_private.email_config WHERE id),
    'queued',(SELECT count(*) FROM reminder_private.deliveries WHERE email_status IN ('queued','sending')),
    'accepted',(SELECT count(*) FROM reminder_private.deliveries WHERE email_status='accepted'),
    'failed',(SELECT count(*) FROM reminder_private.deliveries WHERE email_status='failed'));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_document_email_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_document_email_status() TO authenticated;

-- Discovery counts must not continue treating expired proof as current.
CREATE OR REPLACE FUNCTION public.get_trust_passport(p_user_id uuid)
RETURNS TABLE(account_created_at timestamptz,contracts_completed integer,rating numeric,rating_count integer,approved_references bigint,approved_evidence bigint,approved_platform_history bigint,trust_level text,account_standing text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH signals AS (SELECT p.created_at,p.contracts_completed,p.rating,p.rating_count,p.is_suspended,
    (SELECT count(*) FROM public.documents d WHERE d.user_id=p.id AND d.verified AND d.type IN ('work_history','other_trust_evidence') AND d.expiry_date>=current_date) evidence,
    (SELECT count(*) FROM public.driver_platform_history h WHERE h.driver_id=p.id AND h.approved AND h.review_status='approved' AND h.expires_at>now()) history
    FROM public.profiles p WHERE p.id=p_user_id)
  SELECT created_at,contracts_completed,rating,rating_count,0::bigint,evidence,history,
    CASE WHEN rating_count>=3 OR evidence+history>=3 THEN 'established' WHEN rating_count>0 OR evidence+history>0 THEN 'building' ELSE 'new' END,
    CASE WHEN is_suspended THEN 'restricted' ELSE 'good' END FROM signals;
$$;
NOTIFY pgrst,'reload schema';
