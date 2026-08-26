-- Profile photos are user-controlled and publish immediately. Vehicle photos
-- and trust evidence keep their separate moderation workflows.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_upload_own_folder" ON storage.objects;
CREATE POLICY "avatars_upload_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid())
  WITH CHECK (
    bucket_id = 'avatars'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());

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
    -- Members may update only their own avatar to a URL in their own public
    -- avatars folder; account roles and trust fields remain protected.
    IF NOT (
      NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
      AND NEW.avatar_url LIKE '%/storage/v1/object/public/avatars/' || auth.uid()::text || '/%'
      AND NEW.avatar_pending_url IS NULL
      AND NEW.avatar_upload_status = 'approved'
      AND NEW.avatar_rejection_reason IS NULL
      AND NEW.role IS NOT DISTINCT FROM OLD.role
      AND NEW.is_verified IS NOT DISTINCT FROM OLD.is_verified
      AND NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status
      AND NEW.rating IS NOT DISTINCT FROM OLD.rating
      AND NEW.rating_count IS NOT DISTINCT FROM OLD.rating_count
      AND NEW.contracts_completed IS NOT DISTINCT FROM OLD.contracts_completed
      AND NEW.is_suspended IS NOT DISTINCT FROM OLD.is_suspended
      AND NEW.suspension_reason IS NOT DISTINCT FROM OLD.suspension_reason
      AND NEW.suspended_at IS NOT DISTINCT FROM OLD.suspended_at
    ) THEN
      RAISE EXCEPTION 'Privileged profile fields may only be changed by an administrator';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
