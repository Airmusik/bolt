-- Keep reviewed files immutable, not just the rows that point to them.
CREATE FUNCTION public.is_locked_proof_file(p_name text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.driver_platform_history WHERE right(proof_url,length(p_name)+1)='/'||p_name AND review_status IN ('pending','approved','rejected'))
    OR EXISTS(SELECT 1 FROM public.platform_history_versions WHERE right(snapshot->>'proof_url',length(p_name)+1)='/'||p_name)
    OR EXISTS(SELECT 1 FROM public.documents WHERE right(file_url,length(p_name)+1)='/'||p_name AND type IN ('work_history','other_trust_evidence'));
$$;
REVOKE ALL ON FUNCTION public.is_locked_proof_file(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_locked_proof_file(text) TO authenticated;
CREATE POLICY locked_proof_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(bucket_id<>'documents' OR public.is_admin() OR NOT public.is_locked_proof_file(name))
  WITH CHECK(bucket_id<>'documents' OR public.is_admin() OR NOT public.is_locked_proof_file(name));
CREATE POLICY locked_proof_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING(bucket_id<>'documents' OR public.is_admin() OR NOT public.is_locked_proof_file(name));

-- No client needs another member's private proof URL or rejection details.
DROP POLICY dph_read_approved_owner_admin ON public.driver_platform_history;
CREATE POLICY history_private_read ON public.driver_platform_history FOR SELECT TO authenticated USING(driver_id=auth.uid() OR public.is_admin());

-- Removing discovery must not turn senders in existing chat history into
-- anonymous "Member" placeholders. Existing chat participants retain cards.
CREATE FUNCTION public.shares_saved_chat(p_member_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.conversations c WHERE auth.uid() IN (c.driver_id,c.owner_id,c.admin_id) AND p_member_id IN (c.driver_id,c.owner_id,c.admin_id));
$$;
REVOKE ALL ON FUNCTION public.shares_saved_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shares_saved_chat(uuid) TO anon,authenticated;
DROP POLICY profile_document_visibility ON public.profiles;
CREATE POLICY profile_document_visibility ON public.profiles AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(document_listing_visibility='public' OR id=auth.uid() OR public.is_admin() OR public.shares_saved_chat(id));

CREATE FUNCTION public.gate_document_listing_visibility() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status IN ('pending','accepted') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    IF NEW.vehicle_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.vehicles WHERE id=NEW.vehicle_id AND document_listing_visibility<>'public') THEN RAISE EXCEPTION 'This listing is private or removed and cannot receive new connections'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER gate_document_listing_visibility BEFORE INSERT OR UPDATE OF status ON public.connections FOR EACH ROW EXECUTE FUNCTION public.gate_document_listing_visibility();
CREATE TRIGGER gate_document_listing_visibility BEFORE INSERT OR UPDATE OF status ON public.applications FOR EACH ROW EXECUTE FUNCTION public.gate_document_listing_visibility();

CREATE OR REPLACE FUNCTION public.discover_drivers(p_limit integer DEFAULT 1000,p_verified_only boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(result)),'[]'::jsonb) FROM (
    SELECT p.id,p.role,p.full_name,p.avatar_url,p.bio,p.location,p.preferred_locations,p.availability,p.languages,p.age,p.driving_experience_years,p.platforms_worked,
      (p.platform_history_approved AND p.platform_history_valid_until>now()) AS is_verified,
      CASE WHEN p.verification_status='approved' AND p.platform_history_valid_until<=now() THEN 'unverified' ELSE p.verification_status END AS verification_status,
      p.is_suspended,p.rating,p.rating_count,p.onboarding_completed,p.created_at,p.updated_at,
      (p.platform_history_approved AND p.platform_history_valid_until>now()) AS platform_history_approved,
      p.platform_history_submitted,p.platform_history_valid_until,
      EXISTS(SELECT 1 FROM public.active_promotion_targets() a WHERE a.kind='profile' AND a.target_id=p.id) AS sponsored
    FROM public.profiles p WHERE p.role='driver' AND p.onboarding_completed AND NOT p.is_suspended AND p.document_listing_visibility='public'
      AND (NOT p_verified_only OR (p.platform_history_approved AND p.platform_history_valid_until>now()))
    ORDER BY sponsored DESC,platform_history_approved DESC,p.rating DESC,p.created_at DESC,p.id LIMIT greatest(1,least(COALESCE(p_limit,1000),1000))
  ) result;
$$;

-- Public platform activity projection excludes proof URLs and review reasons.
CREATE FUNCTION public.public_platform_history(p_driver_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',h.id,'driver_id',h.driver_id,'platform',h.platform,'months_active',h.months_active,'rating',h.rating,'approved',true,'created_at',h.created_at)),'[]'::jsonb)
  FROM public.driver_platform_history h JOIN public.profiles p ON p.id=h.driver_id
  WHERE h.driver_id=p_driver_id AND h.review_status='approved' AND h.approved AND h.expires_at>now() AND p.document_listing_visibility='public' AND p.onboarding_completed AND NOT p.is_suspended;
$$;
REVOKE ALL ON FUNCTION public.public_platform_history(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_platform_history(uuid) TO anon,authenticated;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AND NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='driver_platform_history') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_platform_history;
  END IF;
END $$;
NOTIFY pgrst,'reload schema';
