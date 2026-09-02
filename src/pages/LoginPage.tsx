import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, Mail, Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { useSiteSettings } from '@/lib/siteSettings';
import { SiteLogo } from '@/components/SiteLogo';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { googleAuthDestination } from '@/lib/googleAuth';

export function LoginPage() {
  const { signIn, user, profile, loading: authLoading, registrationRequired, resetPin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showReset, setShowReset] = useState(() => new URLSearchParams(window.location.search).get('forgot') === '1');
  const [resetEmail, setResetEmail] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const legacyResetMode = new URLSearchParams(window.location.search).get('reset') === '1';
  const { settings } = useSiteSettings();
  const supportMessage = `Need help? Contact ${settings.admin_contact_email} or ${settings.admin_contact_phone}.`;

  const backToSignIn = () => {
    setShowReset(false);
    setResetSent(false);
    setResetError(null);
    navigate('/login', { replace: true });
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (resetting) return;
    setResetError(null);
    setResetting(true);
    try {
      const { error } = await resetPin(resetEmail);
      if (error) setResetError(error);
      else setResetSent(true);
    } catch {
      setResetError('Something unexpected happened. Check your connection and try again.');
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    if (user && !authLoading && (profile || registrationRequired) && !legacyResetMode) {
      navigate(googleAuthDestination(profile, registrationRequired), { replace: true });
    }
  }, [user, authLoading, profile, registrationRequired, legacyResetMode, navigate]);

  if (legacyResetMode) return <ResetPasswordPage />;

  if (showReset) {
    return (
      <div className="auth-page sm:min-h-[75vh] sm:items-center">
        <div className="w-full max-w-md">
          <div className="auth-heading">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-50 text-accent-600 ring-1 ring-ink-200 dark:text-accent-400">
              <Mail className="h-5 w-5" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Reset your password</h1>
            <p className="mt-1 text-sm text-ink-500">Enter your account email and we will send a reset link.</p>
          </div>
          {resetSent ? (
            <div role="status" className="auth-card text-center">
              <Check className="mx-auto h-10 w-10 text-success" />
              <h2 className="mt-3 font-semibold text-ink-900">Check your inbox</h2>
              <p className="mt-2 break-words text-sm leading-6 text-ink-600">If an account exists for <strong>{resetEmail}</strong>, a password-reset link has been sent.</p>
              <p className="auth-hint">Check your spam folder too. Open the link to choose a new password.</p>
            </div>
          ) : (
            <form onSubmit={handleReset} className="auth-card" aria-busy={resetting}>
              {resetError && <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{resetError}</div>}
              <div>
                <label htmlFor="reset-email" className="label">Email address <span className="text-danger">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                  <input id="reset-email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" className="input pl-10" required aria-describedby="reset-email-hint" />
                </div>
                <p id="reset-email-hint" className="auth-hint">Use the email address registered on your account.</p>
              </div>
              <button type="submit" disabled={resetting} className="btn-primary mt-6 min-h-12 w-full">{resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{resetting ? 'Sending…' : 'Send reset link'}</button>
            </form>
          )}
          <button type="button" disabled={resetting} onClick={backToSignIn} className="btn-ghost mt-3 w-full">Back to sign in</button>
          <p className="mt-3 break-words text-center text-xs leading-5 text-ink-500">{supportMessage}</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || googleBusy) return;
    setError(null);
    setLoading(true);
    try {
      const { error } = await signIn(email, pin);
      if (error) setError(error);
      else {
        toast(`Welcome back to ${settings.site_name}.`);
        navigate('/dashboard');
      }
    } catch {
      setError('Something unexpected happened. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page sm:min-h-[75vh] sm:items-center">
      <div className="w-full max-w-md">
        <div className="auth-heading">
          <Link to="/" aria-label={`${settings.site_name} home`} className="inline-flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
            <SiteLogo size="lg" />
          </Link>
          <h1 className="mt-3 font-display text-2xl font-bold text-ink-900 sm:text-3xl">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in with your email and password.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-card" aria-busy={loading}>
          {error && (
            <div role="alert" aria-live="polite" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <GoogleSignInButton disabled={loading} onBusyChange={setGoogleBusy} onError={setError} />
          <div>
            <label htmlFor="login-email" className="label">Email address <span className="text-danger">*</span></label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                id="login-email"
                aria-describedby="login-email-hint"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="input pl-10"
                required
              />
            </div>
            <p id="login-email-hint" className="auth-hint">Use the email you registered with.</p>
          </div>
          <div className="mt-5">
            <label htmlFor="login-password" className="label">Password <span className="text-danger">*</span></label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                id="login-password"
                autoComplete="current-password"
                aria-describedby="login-password-hint"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type={showPin ? 'text' : 'password'}
                placeholder="Your password"
                className="input pl-10 pr-12"
                required
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Hide password' : 'Show password'} aria-pressed={showPin} className="password-toggle">
                {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p id="login-password-hint" className="auth-hint">Passwords are case-sensitive.</p>
          </div>
          <button type="submit" disabled={loading || googleBusy} className="btn-primary mt-6 min-h-12 w-full">
            {loading ? 'Signing in…' : 'Sign in'} {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </button>
          <button type="button" disabled={loading} onClick={() => { setResetEmail(email); setShowReset(true); setResetError(null); setResetSent(false); }} className="btn-ghost mt-2 w-full font-medium">Forgot your password?</button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-500">
          New to {settings.site_name}?{' '}
          <Link to="/register" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline-offset-4 hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
