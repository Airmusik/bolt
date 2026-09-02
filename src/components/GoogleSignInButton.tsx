import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { isGoogleSignInEnabled, startGoogleSignIn } from '@/lib/googleSignIn';

export function GoogleSignInButton({ disabled, role, onBusyChange, onError }: {
  disabled?: boolean;
  role?: 'driver' | 'owner';
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void isGoogleSignInEnabled(controller.signal).then(setEnabled).catch(() => {
      // Email sign-in stays available if the provider is off or unreachable.
    });
    return () => controller.abort();
  }, []);

  if (!enabled) return null;
  const signIn = async () => {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange(true);
    onError(null);
    try {
      await startGoogleSignIn(role);
    } catch {
      onError('Could not open Google sign-in. Check your connection and try again, or use email and password.');
      setBusy(false);
      onBusyChange(false);
    }
  };
  return (
    <div className="mb-5">
      <button type="button" onClick={() => void signIn()} disabled={disabled || busy} className="btn-secondary min-h-12 w-full gap-3" aria-busy={busy}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : (
          <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
            <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.17v5.13h6.62c3.87-3.56 6.07-8.8 6.07-14.8Z" />
            <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.5-4.94l-6.62-5.13c-1.83 1.23-4.17 1.98-6.88 1.98-5.3 0-9.8-3.58-11.41-8.4H5.76v5.29A20 20 0 0 0 24 44Z" />
            <path fill="#FBBC05" d="M12.59 27.51a12 12 0 0 1 0-7.02V15.2H5.76a20 20 0 0 0 0 17.6l6.83-5.29Z" />
            <path fill="#EA4335" d="M24 12.09c3 0 5.68 1.03 7.81 3.04l5.86-5.86A19.66 19.66 0 0 0 24 4 20 20 0 0 0 5.76 15.2l6.83 5.29C14.2 15.67 18.7 12.09 24 12.09Z" />
          </svg>
        )}
        {busy ? 'Opening Google…' : 'Continue with Google'}
      </button>
      <div className="mt-5 flex items-center gap-3 text-xs text-ink-500"><span className="h-px flex-1 bg-ink-200" />or use email and password<span className="h-px flex-1 bg-ink-200" /></div>
    </div>
  );
}
