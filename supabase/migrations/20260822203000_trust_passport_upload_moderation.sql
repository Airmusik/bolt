/*
  Replace KYC with a transparent Trust Passport and require moderation for every
  user-uploaded asset that can appear in the application.
*/

-- ---------- Profile-photo moderation ----------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_pending_url text,
  ADD COLUMN IF NOT EXISTS avatar_upload_status text NOT NULL DEFAULT 'none'
    CHECK (avatar_upload_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS avatar_rejection_reason text;

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin()
    AND current_setting('app.profile_system_update', true) IS DISTINCT FROM 'on'
    AND (
      NEW.role IS DISTINCT FROM OLD.role OR
      NEW.avatar_url IS DISTINCT FROM OLD.avatar_url OR
      NEW.is_verified IS DISTINCT FROM OLD.is_verified OR
      NEW.verification_status IS DISTINCT FROM OLD.verification_status OR
      NEW.rating IS DISTINCT FROM OLD.rating OR
      NEW.rating_count IS DISTINCT FROM OLD.rating_count OR
      NEW.contracts_completed IS DISTINCT FROM OLD.contracts_completed OR
      NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR
      NEW.suspension_reason IS DISTINCT FROM OLD.suspension_reason OR
      NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR
      NEW.avatar_upload_status IS DISTINCT FROM OLD.avatar_upload_status OR
      NEW.avatar_rejection_reason IS DISTINCT FROM OLD.avatar_rejection_reason
    )
  THEN
    -- A member may submit or replace a pending photo, but never approve it.
    IF NOT (
      NEW.avatar_pending_url IS DISTINCT FROM OLD.avatar_pending_url
      AND NEW.avatar_url IS NOT DISTINCT FROM OLD.avatar_url
      AND NEW.role IS NOT DISTINCT FROM OLD.role
      AND NEW.is_verified IS NOT DISTINCT FROM OLD.is_verified
      AND NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status
      AND NEW.rating IS NOT DISTINCT FROM OLD.rating
      AND NEW.rating_count IS NOT DISTINCT FROM OLD.rating_count
      AND NEW.contracts_completed IS NOT DISTINCT FROM OLD.contracts_completed
      AND NEW.is_suspended IS NOT DISTINCT FROM OLD.is_suspended
      AND NEW.suspension_reason IS NOT DISTINCT FROM OLD.suspension_reason
      AND NEW.suspended_at IS NOT DISTINCT FROM OLD.suspended_at
      AND NEW.avatar_upload_status = 'pending'
      AND NEW.avatar_rejection_reason IS NULL
    ) THEN
      RAISE EXCEPTION 'Privileged profile fields may only be changed by an administrator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Existing public avatars are treated as already approved. New submissions use
-- avatar_pending_url and cannot replace the visible avatar until admin approval.
UPDATE public.profiles
SET avatar_upload_status = CASE WHEN avatar_url IS NULL THEN 'none' ELSE 'approved' END
WHERE avatar_upload_status = 'none';

-- ---------- Vehicle-photo moderation ----------
ALTER TABLE public.vehicle_photos
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Preserve historical listing photos while making every new photo pending.
UPDATE public.vehicle_photos SET approved = true WHERE created_at < now();

DROP POLICY IF EXISTS "vehicle_photos_insert_owner" ON public.vehicle_photos;
CREATE POLICY "vehicle_photos_insert_owner_pending" ON public.vehicle_photos
  FOR INSERT TO authenticated WITH CHECK (
    approved = false
    AND rejected = false
    AND rejection_reason IS NULL
    AND EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND v.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vehicle_photos_read_all" ON public.vehicle_photos;
CREATE POLICY "vehicle_photos_read_approved_owner_admin" ON public.vehicle_photos
  FOR SELECT TO authenticated USING (
    approved
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.vehicles v
      WHERE v.id = vehicle_id AND v.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "vehicle_photos_update_admin" ON public.vehicle_photos;
CREATE POLICY "vehicle_photos_update_admin" ON public.vehicle_photos
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_vehicle_photo_moderation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() AND (
    NEW.approved IS DISTINCT FROM OLD.approved OR
    NEW.rejected IS DISTINCT FROM OLD.rejected OR
    NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
  ) THEN
    RAISE EXCEPTION 'Vehicle-photo moderation is administrator-only';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_vehicle_photo_moderation ON public.vehicle_photos;
CREATE TRIGGER trg_protect_vehicle_photo_moderation
  BEFORE UPDATE ON public.vehicle_photos
  FOR EACH ROW EXECUTE FUNCTION public.protect_vehicle_photo_moderation();

-- ---------- Trust evidence (reuses the private documents bucket) ----------
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_type_check CHECK (
  type IN (
    'national_id','driving_licence','psv_badge','good_conduct','logbook','business',
    'platform_history','profile_photo','vehicle_photo',
    'work_history','vehicle_inspection','vehicle_ownership','reference_letter','other_trust_evidence'
  )
);

DROP POLICY IF EXISTS "documents_insert_own" ON public.documents;
CREATE POLICY "documents_insert_own_pending" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND verified = false
    AND rejected = false
    AND rejection_reason IS NULL
  );

DROP POLICY IF EXISTS "dph_read_all" ON public.driver_platform_history;
CREATE POLICY "dph_read_approved_owner_admin" ON public.driver_platform_history
  FOR SELECT TO authenticated USING (
    approved OR driver_id = auth.uid() OR public.is_admin()
  );

DROP POLICY IF EXISTS "dph_insert_own" ON public.driver_platform_history;
CREATE POLICY "dph_insert_own_pending" ON public.driver_platform_history
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = driver_id AND approved = false
  );

-- ---------- References ----------
CREATE TABLE IF NOT EXISTS public.trust_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_name text NOT NULL CHECK (char_length(trim(referee_name)) BETWEEN 2 AND 100),
  relationship text NOT NULL CHECK (char_length(trim(relationship)) BETWEEN 2 AND 100),
  referee_contact text NOT NULL CHECK (char_length(trim(referee_contact)) BETWEEN 5 AND 180),
  note text CHECK (note IS NULL OR char_length(note) <= 800),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trust_references ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_trust_references_user ON public.trust_references(user_id);
CREATE INDEX IF NOT EXISTS idx_trust_references_status ON public.trust_references(status);

DROP POLICY IF EXISTS "trust_references_read_own_admin" ON public.trust_references;
CREATE POLICY "trust_references_read_own_admin" ON public.trust_references
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "trust_references_insert_own" ON public.trust_references;
CREATE POLICY "trust_references_insert_own" ON public.trust_references
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id AND status = 'pending');

DROP POLICY IF EXISTS "trust_references_delete_own_admin" ON public.trust_references;
CREATE POLICY "trust_references_delete_own_admin" ON public.trust_references
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "trust_references_update_admin" ON public.trust_references;
CREATE POLICY "trust_references_update_admin" ON public.trust_references
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_touch_trust_references ON public.trust_references;
CREATE TRIGGER trg_touch_trust_references
  BEFORE UPDATE ON public.trust_references
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------- Safe, public Trust Passport summary ----------
CREATE OR REPLACE FUNCTION public.get_trust_passport(p_user_id uuid)
RETURNS TABLE (
  account_created_at timestamptz,
  contracts_completed integer,
  rating numeric,
  rating_count integer,
  approved_references bigint,
  approved_evidence bigint,
  approved_platform_history bigint,
  trust_level text,
  account_standing text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH signals AS (
    SELECT
      p.created_at,
      p.contracts_completed,
      p.rating,
      p.rating_count,
      p.is_suspended,
      (SELECT count(*) FROM public.trust_references tr WHERE tr.user_id = p.id AND tr.status = 'approved') AS refs,
      (SELECT count(*) FROM public.documents d
        WHERE d.user_id = p.id
          AND d.verified
          AND d.type IN ('work_history','vehicle_inspection','vehicle_ownership','reference_letter','other_trust_evidence')) AS evidence,
      (SELECT count(*) FROM public.driver_platform_history h WHERE h.driver_id = p.id AND h.approved) AS history
    FROM public.profiles p
    WHERE p.id = p_user_id
  )
  SELECT
    created_at,
    contracts_completed,
    rating,
    rating_count,
    refs,
    evidence,
    history,
    CASE
      WHEN contracts_completed >= 3 OR rating_count >= 3 OR refs + evidence + history >= 3 THEN 'established'
      WHEN contracts_completed > 0 OR rating_count > 0 OR refs + evidence + history > 0 THEN 'building'
      ELSE 'new'
    END,
    CASE WHEN is_suspended THEN 'restricted' ELSE 'good' END
  FROM signals;
$$;
REVOKE ALL ON FUNCTION public.get_trust_passport(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_trust_passport(uuid) TO authenticated;

-- Users may only send text in chat. This prevents an unmoderated upload path.
DROP POLICY IF EXISTS "msg_insert_unblocked_parties" ON public.messages;
CREATE POLICY "msg_insert_unblocked_parties" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND public.can_send_to_conversation(conversation_id)
    AND type = 'text'
  );

-- KYC is permanently disabled; the UI now exposes Trust Passport instead.
INSERT INTO public.site_settings (key, value, updated_at)
VALUES ('kyc_enabled', 'false', now())
ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = now();

-- New member uploads go to the private documents bucket. Only an admin can copy
-- an approved photo into the public vehicle-photos bucket.
DROP POLICY IF EXISTS "vehicle_photos_upload" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_photos_upload_own_folder" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_photos_upload_admin_only" ON storage.objects;
CREATE POLICY "vehicle_photos_upload_admin_only" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'vehicle-photos'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "documents_upload" ON storage.objects;
DROP POLICY IF EXISTS "documents_upload_own_folder" ON storage.objects;
CREATE POLICY "documents_upload_own_folder" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
