/*
# Fix connection acceptance + auto-set driver unavailable

## Changes
1. conversations.vehicle_id was NOT NULL — general connections have no
   vehicle, so conversation insert failed on accept. Make it nullable.
2. Add a trigger that auto-sets the driver's profile.availability to
   'unavailable' when a connection is accepted.
3. conversations RLS insert policy referenced driver_id/owner_id which are
   populated by the client; keep it but also allow when the inserting user
   is a party to the connection (safer for connection-based convos).
*/

-- 1. Allow conversations without a vehicle (general connections)
ALTER TABLE public.conversations ALTER COLUMN vehicle_id DROP NOT NULL;

-- 2. Trigger: when a connection becomes 'accepted', mark the driver unavailable
CREATE OR REPLACE FUNCTION public.mark_driver_unavailable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    -- determine which party is the driver
    SELECT id INTO v_driver_id FROM public.profiles
    WHERE id IN (NEW.requester_id, NEW.recipient_id) AND role = 'driver'
    LIMIT 1;
    IF v_driver_id IS NOT NULL THEN
      UPDATE public.profiles SET availability = 'unavailable' WHERE id = v_driver_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conn_mark_unavailable ON public.connections;
CREATE TRIGGER trg_conn_mark_unavailable
  AFTER UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.mark_driver_unavailable();

-- 3. Relax conversations insert policy to allow a connection party to insert
DROP POLICY IF EXISTS "conv_insert_parties" ON public.conversations;
CREATE POLICY "conv_insert_parties" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = driver_id OR auth.uid() = owner_id OR EXISTS (
      SELECT 1 FROM public.connections c
      WHERE c.id = connection_id
      AND (c.requester_id = auth.uid() OR c.recipient_id = auth.uid())
    )
  );
