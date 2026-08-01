/*
# Restrict driver availability updates

## Overview
Drivers must NOT be able to set their own availability to 'available'.
Only car owners (who accepted the connection) and admins can mark a driver
as available. This prevents a driver from bypassing the platform and working
with multiple car owners simultaneously.

## Changes
- Replaces the existing UPDATE policy on `profiles` for the `availability`
  column so that:
  - A driver can only set availability to 'unavailable' themselves.
  - Only an authenticated user who is an owner/admin can set a driver's
    availability to 'available'.
- Adds a SECURITY DEFINER helper function `set_driver_available(driver_id uuid)`
  that owners and admins call to mark a driver available. The function validates
  that the caller owns an accepted connection with that driver (or is admin).

## Security
- Function runs as DEFINER (bypasses RLS) but validates caller role and
  connection ownership before executing.
- Granted EXECUTE to `authenticated` only.
*/

-- Remove the blanket driver self-update of availability
-- The existing "update_own_profile" policy already controls self-updates;
-- we add a restrictive CHECK to prevent drivers self-setting 'available'.

-- Drop and recreate the profiles UPDATE policy with availability guard
DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- Non-drivers can update freely
      role <> 'driver'
      -- Drivers cannot self-promote to 'available'; they can only set 'unavailable'
      OR (role = 'driver' AND availability <> 'available')
      -- Exception: allow if the caller IS an admin (they update other profiles too)
      OR public.is_admin()
    )
  );

-- Allow admins to update any profile (already existed, recreate for safety)
DROP POLICY IF EXISTS "admin_update_any_profile" ON public.profiles;
CREATE POLICY "admin_update_any_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- SECURITY DEFINER function: set a driver as available
-- Called by owners after ending a connection, or by admins.
CREATE OR REPLACE FUNCTION public.set_driver_available(p_driver_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role text;
  v_connection_exists boolean;
BEGIN
  -- get caller role
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role = 'admin' THEN
    -- admin can always mark available
    UPDATE public.profiles SET availability = 'available' WHERE id = p_driver_id AND role = 'driver';
    RETURN;
  END IF;

  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only car owners or admins can mark a driver as available';
  END IF;

  -- owner must have an accepted or ended connection with this driver
  SELECT EXISTS (
    SELECT 1 FROM public.connections
    WHERE status IN ('accepted', 'ended')
      AND (
        (requester_id = p_driver_id AND recipient_id = auth.uid())
        OR (recipient_id = p_driver_id AND requester_id = auth.uid())
      )
  ) INTO v_connection_exists;

  IF NOT v_connection_exists THEN
    RAISE EXCEPTION 'No connection found between you and this driver';
  END IF;

  UPDATE public.profiles SET availability = 'available' WHERE id = p_driver_id AND role = 'driver';
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_driver_available(uuid) TO authenticated;
