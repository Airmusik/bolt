import { Link } from 'react-router-dom';
import type { Profile } from '@/lib/types';
import { driverApprovalLabel, driverApprovalMessage } from '@/lib/driverEligibility';
export function DriverApprovalNotice({ profile }: { profile: Profile }) {
  return <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm text-ink-700"><p className="font-semibold">{driverApprovalLabel(profile)}</p><p className="mt-2">{driverApprovalMessage(profile)}</p><Link to="/onboarding" className="btn-secondary mt-3">{profile.platform_history_submitted ? 'View submission' : 'Submit platform history'}</Link></div>;
}
