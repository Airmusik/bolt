import { Link, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { initialGoogleCallbackError } from '@/lib/supabase';
import { googleAuthDestination } from '@/lib/googleAuth';

export function AuthCallbackPage() {
  const { user, profile, loading, registrationRequired, profileError, refreshProfile, signOut } = useAuth();
  const error = initialGoogleCallbackError || profileError;
  if (error || (!loading && !user)) return (
    <div className="auth-page"><div className="auth-card w-full max-w-md text-center">
      <h1 className="text-xl font-semibold text-ink-900">Let's try that again</h1>
      <p role="alert" className="mt-3 text-sm text-ink-600">{error || 'No Google session was received. Please start sign-in again.'}</p>
      {profileError && <button type="button" onClick={() => void refreshProfile()} className="btn-primary mt-4 w-full">Retry account loading</button>}
      {user ? <button type="button" onClick={() => void signOut()} className="btn-secondary mt-3 w-full">Sign out and try again</button> : <Link to="/login" replace className="btn-secondary mt-4 w-full">Back to sign in</Link>}
    </div></div>
  );
  if (loading || (!profile && !registrationRequired)) return <div role="status" className="flex min-h-[60vh] items-center justify-center gap-3 text-ink-600"><Loader2 className="h-6 w-6 animate-spin" />Finishing Google sign-in…</div>;
  return <Navigate to={googleAuthDestination(profile, registrationRequired)} replace />;
}
