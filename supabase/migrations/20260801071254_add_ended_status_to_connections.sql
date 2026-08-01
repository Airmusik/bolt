/*
# Add 'ended' status to connections

Allows either party to end an accepted connection, which:
- Sets the connection status to 'ended'
- Restores the driver's availability to 'available'
- Closes the associated conversation (no new messages)
*/

ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_status_check;
ALTER TABLE public.connections
  ADD CONSTRAINT connections_status_check CHECK (status IN ('pending','accepted','rejected','withdrawn','ended'));
