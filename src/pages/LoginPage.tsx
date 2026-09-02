import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowRight, Mail, Check } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { BackButton } from '@/components/BackButton';
import { useSiteSettings } from '@/lib/siteSettings';
import { SiteLogo } from '@/components/SiteLogo';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';

export function LoginPage() {
  const { signIn, user, resetPin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showReset, setShowReset] = useState(() => new URLSearchParams(window.location.search).get('forgot') === '1');
  const [resetEmail, setResetEmail] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const legacyResetMode = new URLSearchParams(window.location.search).get('reset') === '1';
  const { settings } = useSiteSettings();
  const supportMessage = `Contact support at ${settings.admin_contact_email} or ${settings.admin_contact_phone} to reset your password.`;

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
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
    if (user && !legacyResetMode) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, legacyResetMode, navigate]);

  if (legacyResetMode) return <ResetPasswordPage />;

  if (showReset) {
    return (
      <div className="container-content flex min-h-[80vh] items-center justify-center py-12">
        <div className="w-full max-w-md">
          <BackButton to="/login" className="mb-4" />
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Reset your password</h1>
            <p className="mt-1 text-sm text-ink-500">Enter your account email and we will send a reset link.</p>
            <p className="mt-2 text-xs text-ink-500">{supportMessage}</p>
          </div>
          {resetSent ? (
            <div className="card p-6 text-center">
              <Check className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 text-sm text-ink-600">If an account exists for <strong>{resetEmail}</strong>, a password-reset link has been sent.</p>
              <p className="mt-2 text-xs text-ink-500">{supportMessage}</p>
              <button onClick={() => { setShowReset(false); setResetSent(false); }} className="btn-secondary mt-4">Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="card p-6">
              {resetError && <div role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{resetError}</div>}
              <div>
                <label className="label">Email address <span className="text-danger">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                  <input value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" className="input pl-10" required />
                </div>
                <p className="mt-1.5 text-xs text-ink-400">Use the email address registered on your account.</p>
              </div>
              <button type="submit" disabled={resetting} className="btn-primary mt-6 w-full">{resetting ? 'Sending…' : 'Send reset link'} <ArrowRight className="h-4 w-4" /></button>
            </form>
          )}
          <button onClick={() => setShowReset(false)} className="mt-4 w-full text-center text-sm text-ink-500 hover:text-ink-800">Back to sign in</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="container-content flex min-h-[80vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <SiteLogo size="lg" />
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in with your email and password.</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          {error && (
            <div role="alert" aria-live="polite" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="label">Email address <span className="text-danger">*</span></label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="input pl-10"
                required
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Enter the email address you used when creating your account.</p>
          </div>
          <div className="mt-4">
            <label className="label">Password <span className="text-danger">*</span></label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type={showPin ? 'text' : 'password'}
                placeholder="Your password"
                className="input pl-10 pr-10"
                required
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Enter your current account password exactly as you created it.</p>
          </div>
          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
            {loading ? 'Signing in…' : 'Sign in'} <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setShowReset(true); setResetError(null); setResetSent(false); }} className="mt-3 w-full text-center text-sm text-brand-700 hover:text-brand-800">Forgot your password?</button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          New to {settings.site_name}?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
