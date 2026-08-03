import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Car, Phone, Lock, Eye, EyeOff, ArrowRight, Mail, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { BackButton } from '@/components/BackButton';

export function LoginPage() {
  const { signIn, user, resetPin } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showReset, setShowReset] = useState(false);
  const [resetPhone, setResetPhone] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === '1') {
      setResetMode(true);
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetting(true);
    const { error } = await resetPin(resetPhone);
    setResetting(false);
    if (error) {
      setResetError(error);
    } else {
      setResetSent(true);
    }
  };

  useEffect(() => {
    if (user) {
      const from = (location.state as { from?: string })?.from || '/dashboard';
      navigate(from, { replace: true });
    }
  }, [user, navigate, location.state]);

  if (resetMode) {
    return (
      <div className="container-content flex min-h-[80vh] items-center justify-center py-12">
        <div className="w-full max-w-md">
          <BackButton to="/login" className="mb-4" />
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Set a new PIN</h1>
            <p className="mt-1 text-sm text-ink-500">We sent a reset link to your account email. Check your inbox and follow the link, then set your new PIN below.</p>
          </div>
          {resetSent ? (
            <div className="card p-6 text-center">
              <Check className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 text-sm text-ink-600">If an account exists for <strong>{resetPhone}</strong>, a reset link has been sent to the email on file.</p>
              <button onClick={() => { setResetMode(false); setResetSent(false); }} className="btn-secondary mt-4">Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="card p-6">
              {resetError && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{resetError}</div>}
              <div>
                <label className="label">Phone number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                  <input value={resetPhone} onChange={(e) => setResetPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" className="input pl-10" required />
                </div>
              </div>
              <button type="submit" disabled={resetting} className="btn-primary mt-6 w-full">{resetting ? 'Sending…' : 'Send reset link'} <ArrowRight className="h-4 w-4" /></button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (showReset) {
    return (
      <div className="container-content flex min-h-[80vh] items-center justify-center py-12">
        <div className="w-full max-w-md">
          <BackButton to="/login" className="mb-4" />
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Reset your PIN</h1>
            <p className="mt-1 text-sm text-ink-500">Enter your phone number and we'll send a reset link to the email you provided at registration.</p>
          </div>
          {resetSent ? (
            <div className="card p-6 text-center">
              <Check className="mx-auto h-10 w-10 text-success" />
              <p className="mt-3 text-sm text-ink-600">If an account exists for <strong>{resetPhone}</strong>, a reset link has been sent to the email on file.</p>
              <button onClick={() => { setShowReset(false); setResetSent(false); }} className="btn-secondary mt-4">Back to sign in</button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="card p-6">
              {resetError && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{resetError}</div>}
              <div>
                <label className="label">Phone number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                  <input value={resetPhone} onChange={(e) => setResetPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" className="input pl-10" required />
                </div>
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
    const { error } = await signIn(phone, pin);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      toast('Welcome back to GariLink.');
      navigate('/dashboard');
    }
  };

  return (
    <div className="container-content flex min-h-[80vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <BackButton to="/" className="mb-4" />
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Car className="h-6 w-6" />
            </span>
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in with your phone number and 4-digit PIN.</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="label">Phone number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0712 345 678"
                inputMode="tel"
                className="input pl-10"
                required
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">PIN</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                placeholder="4-digit PIN"
                className="input pl-10 pr-10"
                required
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
            {loading ? 'Signing in…' : 'Sign in'} <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => { setShowReset(true); setResetError(null); setResetSent(false); }} className="mt-3 w-full text-center text-sm text-brand-700 hover:text-brand-800">Forgot your PIN?</button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          New to GariLink?{' '}
          <Link to="/register" className="font-semibold text-brand-700 hover:text-brand-800">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
