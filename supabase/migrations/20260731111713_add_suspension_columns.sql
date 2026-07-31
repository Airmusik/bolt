/*
# Add user suspension support

1. Changes to `profiles` table
- Add `is_suspended` (boolean, default false) — true when a user is banned from the platform.
- Add `suspension_reason` (text, nullable) — the reason the admin entered when suspending the user.
- Add `suspended_at` (timestamptz, nullable) — when the suspension happened.
2. Security
- No new tables. No RLS policy changes — existing profile policies already cover these columns.
3. Notes
- The frontend reads `is_suspended` after login and shows a full-page "You have been suspended" screen with the reason.
- Admin can toggle `is_suspended` back to false (unban) and clear the reason.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_suspended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;
