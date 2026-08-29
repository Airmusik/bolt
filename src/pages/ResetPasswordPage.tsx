import { useEffect, useState } from 'react';
import { ArrowRight, Check, Lock, Mail } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BackButton } from '@/components/BackButton';
import { useToast } from '@/components/useToast';
import { getAuthErrorMessage } from '@/lib/authErrors';
import { isValidPin } from '@/lib/phoneAuth';
import { supabase } from '@/lib/supabase';
import { useSiteSettings } from '@/lib/siteSettings';

function recoveryUrlError() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const description = query.get('error_description') || hash.get('error_description');
  const code = query.get('error_code') || hash.get('error_code');
  return description || code;
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { settings } = useSiteSettings();
  const [checkingSession, setCheckingSession] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let active = true;
    const callbackError = recoveryUrlError();
    if (callbackError) {
      setError(getAuthErrorMessage(new Error(callbackError), 'passwordUpdate'));
      setCheckingSession(false);
      return () => { active = false; };
    }

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) {
        setError('This password-reset link is invalid or has expired. Request a new link and try again.');
        setRecoveryReady(false);
      } else {
        setRecoveryReady(true);
      }
      setCheckingSession(false);
    });

    return () => { active = false; };
  }, []);

  const handlePasswordUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!recoveryReady) {
      setError('This password-reset link is invalid or has expired. Request a new link and try again.');
      return;
    }
    if (!isValidPin(newPassword)) {
      setError('Use at least 10 characters with uppercase, lowercase, and a number.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter them.');
      return;
    }

    setResetting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(getAuthErrorMessage(updateError, 'passwordUpdate'));
        return;
      }
      setUpdated(true);
      await supabase.auth.signOut();
      toast('Password updated successfully. Sign in with your new password.');
    } catch (updateError) {
      setError(getAuthErrorMessage(updateError, 'passwordUpdate'));
    } finally {
      setResetting(false);
    }
  };

  const supportMessage = `Need help? Contact ${settings.admin_contact_email} or ${settings.admin_contact_phone}.`;

  return (
    <div className="container-content flex min-h-[80vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <BackButton to="/login" className="mb-4" />
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white"><Lock className="h-6 w-6" /></div>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Set a new password</h1>
          <p className="mt-1 text-sm text-ink-500">Use at least 10 characters with uppercase, lowercase, and a number.</p>
        </div>

        {checkingSession ? (
          <div className="card p-6 text-center text-sm text-ink-500">Checking your secure reset link…</div>
        ) : updated ? (
          <div className="card p-6 text-center">
            <Check className="mx-auto h-10 w-10 text-success" />
            <h2 className="mt-3 font-semibold text-ink-900">Password updated</h2>
            <p className="mt-2 text-sm text-ink-500">Your old password no longer works. Sign in using the new password.</p>
            <button type="button" onClick={() => navigate('/login', { replace: true })} className="btn-primary mt-5 w-full">Continue to sign in <ArrowRight className="h-4 w-4" /></button>
          </div>
        ) : recoveryReady ? (
          <form onSubmit={handlePasswordUpdate} className="card p-6">
            {error && <div role="alert" aria-live="polite" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div>
              <label className="label" htmlFor="new-password">New password <span className="text-danger">*</span></label>
              <div className="relative"><Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" /><input id="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="At least 10 characters" className="input pl-10" required /></div>
              <p className="mt-1.5 text-xs text-ink-400">Use at least 10 characters with uppercase, lowercase, and a number.</p>
            </div>
            <div className="mt-4">
              <label className="label" htmlFor="confirm-new-password">Confirm new password <span className="text-danger">*</span></label>
              <div className="relative"><Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" /><input id="confirm-new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="Repeat password" className="input pl-10" required /></div>
              <p className="mt-1.5 text-xs text-ink-400">Repeat the new password exactly.</p>
            </div>
            <button type="submit" disabled={resetting} className="btn-primary mt-6 w-full">{resetting ? 'Updating…' : 'Update password'} <ArrowRight className="h-4 w-4" /></button>
          </form>
        ) : (
          <div className="card p-6 text-center">
            <Mail className="mx-auto h-10 w-10 text-danger" />
            <div role="alert" className="mt-3 text-sm text-red-700">{error}</div>
            <Link to="/login?forgot=1" className="btn-primary mt-5 w-full">Request another reset link</Link>
            <p className="mt-4 text-xs text-ink-500">{supportMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
