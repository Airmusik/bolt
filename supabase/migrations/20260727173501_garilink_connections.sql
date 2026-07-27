/*
# Connections table

## Overview
Adds a general `connections` table so BOTH car owners and drivers can send
connection requests to each other. A conversation (chat) is created only after
a connection is accepted. This generalises the existing applications flow:
driver-to-owner applications can still reference a vehicle, while owner-to-driver
invitations have a null vehicle_id.

## New Table
- `connections`
  - id (uuid pk)
  - requester_id (uuid, the user who sent the request)
  - recipient_id (uuid, the user who receives it)
  - vehicle_id (uuid nullable — set when a driver applies to a specific vehicle)
  - status (text: pending / accepted / rejected / withdrawn)
  - message (text, optional intro message)
  - created_at, updated_at

## Security (RLS)
- Both parties can read their own connections.
- Any authenticated user can insert a connection where they are the requester.
- Recipient can update status (accept/reject). Requester can withdraw.
- Admin can read all.

## Notes
1. UNIQUE(requester_id, recipient_id) prevents duplicate requests between
   the same two users (in one direction). A separate check prevents a user
   from connecting to themselves.
2. Conversations are created on acceptance and linked via a new
   `connection_id` column on `conversations`.
*/

CREATE TABLE IF NOT EXISTS public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, recipient_id)
);
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_conn_requester ON public.connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_conn_recipient ON public.connections(recipient_id);
CREATE INDEX IF NOT EXISTS idx_conn_status ON public.connections(status);

-- prevent self-connections
ALTER TABLE public.connections ADD CONSTRAINT no_self_connection CHECK (requester_id <> recipient_id);

DROP POLICY IF EXISTS "conn_read_parties" ON public.connections;
CREATE POLICY "conn_read_parties" ON public.connections
  FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id OR public.is_admin());

DROP POLICY IF EXISTS "conn_insert_requester" ON public.connections;
CREATE POLICY "conn_insert_requester" ON public.connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "conn_update_parties" ON public.connections;
CREATE POLICY "conn_update_parties" ON public.connections
  FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id OR public.is_admin())
  WITH CHECK (auth.uid() = requester_id OR auth.uid() = recipient_id OR public.is_admin());

-- allow conversation to be linked to a connection
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS connection_id uuid UNIQUE REFERENCES public.connections(id) ON DELETE CASCADE;

-- updated_at trigger for connections
DROP TRIGGER IF EXISTS trg_connections_updated ON public.connections;
CREATE TRIGGER trg_connections_updated BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
