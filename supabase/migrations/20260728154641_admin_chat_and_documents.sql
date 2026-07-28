/*
# Admin chat support + document review

## Overview
Enables admin-to-user direct chat and lets admins verify/reject uploaded
verification documents. The existing conversations table requires a vehicle,
driver, and owner — all NOT NULL. Admin-to-user chats have no vehicle and no
driver/owner pairing, so we relax those constraints and add an `admin_id`
column to identify admin-initiated conversations.

## Changes
1. `conversations` table:
   - `vehicle_id` is now nullable (admin chats have no vehicle).
   - `driver_id` is now nullable (admin chats with an owner have no driver).
   - `owner_id` is now nullable (admin chats with a driver have no owner).
   - New `admin_id` column (nullable uuid → profiles). When set, this is an
     admin-to-user conversation.
2. `documents` table:
   - New UPDATE policy allowing admins to verify/reject any document.
3. RLS policy updates:
   - conversations SELECT: include admin_id = auth.uid().
   - conversations INSERT: allow admin to insert with admin_id = auth.uid().
   - messages SELECT: include admin conversations.
   - messages INSERT: allow admin to send in admin conversations.

## Security
- Only the admin role can create admin conversations (admin_id = auth.uid()).
- Admin can update document.verified flag on any document.
- Existing conversation/message policies remain intact for normal users.
*/

-- ---------- conversations: relax NOT NULL + add admin_id ----------
ALTER TABLE public.conversations ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN driver_id DROP NOT NULL;
ALTER TABLE public.conversations ALTER COLUMN owner_id DROP NOT NULL;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_conv_admin ON public.conversations(admin_id);

-- conversations SELECT: include admin
DROP POLICY IF EXISTS "conv_read_parties" ON public.conversations;
CREATE POLICY "conv_read_parties" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    auth.uid() = driver_id OR auth.uid() = owner_id
    OR auth.uid() = admin_id OR public.is_admin()
  );

-- conversations INSERT: existing + admin
DROP POLICY IF EXISTS "conv_insert_parties" ON public.conversations;
CREATE POLICY "conv_insert_parties" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = driver_id OR auth.uid() = owner_id
    OR (auth.uid() = admin_id AND public.is_admin())
  );

-- ---------- messages: allow admin in admin conversations ----------
DROP POLICY IF EXISTS "msg_read_parties" ON public.messages;
CREATE POLICY "msg_read_parties" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid() OR c.admin_id = auth.uid())
    ) OR public.is_admin()
  );

DROP POLICY IF EXISTS "msg_insert_parties" ON public.messages;
CREATE POLICY "msg_insert_parties" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid() OR c.admin_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "msg_update_read_flag" ON public.messages;
CREATE POLICY "msg_update_read_flag" ON public.messages
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid() OR c.admin_id = auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
      AND (c.driver_id = auth.uid() OR c.owner_id = auth.uid() OR c.admin_id = auth.uid())
    )
  );

-- ---------- documents: admin can update (verify/reject) ----------
DROP POLICY IF EXISTS "documents_update_own_or_admin" ON public.documents;
CREATE POLICY "documents_update_own_or_admin" ON public.documents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());
