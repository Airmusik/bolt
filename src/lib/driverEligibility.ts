import type { Profile } from './types';

export function driverNeedsApproval(profile: Pick<Profile, 'role' | 'platform_history_approved'> | null | undefined) {
  return profile?.role === 'driver' && !profile.platform_history_approved;
}
export function driverApprovalMessage(profile: Pick<Profile, 'platform_history_submitted'> | null | undefined) {
  return profile?.platform_history_submitted
    ? 'Your platform history is awaiting admin approval. Connections and availability unlock after approval.'
    : 'Submit your recent Uber, Bolt, Faras, Little Cab or other platform history for admin approval before connecting or changing availability.';
}
export function driverApprovalLabel(profile: Pick<Profile, 'platform_history_submitted'> | null | undefined) {
  return profile?.platform_history_submitted ? 'Awaiting admin approval' : 'Platform history required';
}
