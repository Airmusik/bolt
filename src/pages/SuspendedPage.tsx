import { ShieldOff, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';

export function SuspendedPage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-danger/10">
          <ShieldOff className="h-10 w-10 text-danger" />
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-ink-900">Account Suspended</h1>
        <p className="mt-3 text-sm text-ink-600">
          Your account has been suspended from GariLink. You are unable to access the platform at this time.
        </p>
        {profile?.suspension_reason && (
          <div className="mt-4 rounded-lg border border-danger/20 bg-danger/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-danger">Reason</p>
            <p className="mt-1 text-sm text-ink-700">{profile.suspension_reason}</p>
          </div>
        )}
        {profile?.suspended_at && (
          <p className="mt-3 text-xs text-ink-400">
            Suspended on {new Date(profile.suspended_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
        <p className="mt-4 text-xs text-ink-500">
          If you believe this is a mistake, please contact support at <a href="mailto:support@garilink.com" className="font-medium text-brand-600 hover:underline">support@garilink.com</a>.
        </p>
        <button
          onClick={async () => { await signOut(); navigate('/'); }}
          className="btn-secondary mt-6 w-full"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
