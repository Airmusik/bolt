/*
# Admin helpers and document storage access

## Overview
1. Creates the is_admin helper.
2. Adds storage SELECT policy allowing admins to read all documents.
*/

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- Helper functions ----------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------- Storage policy: admins can read all documents ----------

DROP POLICY IF EXISTS "documents_read_admin" ON storage.objects;
CREATE POLICY "documents_read_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND public.is_admin());

-- Administrators are provisioned out of band; this migration intentionally
-- contains no privileged identities or credentials.
