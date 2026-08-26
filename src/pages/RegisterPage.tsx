import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Car, Phone, Lock, User, Eye, EyeOff, ArrowRight, Check, Mail, MapPin } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { BackButton } from '@/components/BackButton';
import type { Role } from '@/lib/types';
import { ALL_LOCATIONS } from '@/lib/locations';
import { useSiteSettings } from '@/lib/siteSettings';

export function RegisterPage() {
  const { signUp, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [role, setRole] = useState<Role>('driver');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pin !== confirmPin) { setError('Passwords do not match. Please re-enter.'); return; }
    if (!email.trim()) { setError('Email address is required.'); return; }
    if (!location.trim()) { setError('Town or neighbourhood is required.'); return; }
    setLoading(true);
    try {
      const result = await signUp(phone, pin, fullName, role, email, location);
      if (result.error) {
        setError(result.error);
      } else if (result.requiresEmailConfirmation) {
        toast('Account created. Check your email to confirm it before signing in.');
        navigate('/login');
      } else {
        toast(`Account created. Welcome to ${settings.site_name}.`);
        navigate(role === 'driver' ? '/onboarding' : '/dashboard');
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
        <BackButton to="/" className="mb-4" />
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Car className="h-6 w-6" />
            </span>
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">Join {settings.site_name} as a driver or car owner.</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          {error && <div role="alert" aria-live="polite" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="mb-5">
            <label className="label">I am a…</label>
            <div className="grid grid-cols-2 gap-3">
              {(['driver', 'owner'] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`relative rounded-xl border p-4 text-left transition ${role === r ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/30' : 'border-ink-200 bg-white hover:border-ink-300 dark:bg-[#141416]'}`}
                >
                  <p className="font-semibold capitalize text-ink-900">{r}</p>
                  <p className="text-xs text-ink-500">{r === 'driver' ? 'Looking for a car' : 'Have a car to rent'}</p>
                  {role === r && <Check className="absolute right-3 top-3 h-4 w-4 text-brand-600" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Full name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="input pl-10" required />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Phone number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" className="input pl-10" required />
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" className="input pl-10" required />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">You will use this email to sign in and reset your password.</p>
          </div>
          <div className="mt-4">
            <label className="label">Town or neighbourhood</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input value={location} onChange={(event) => setLocation(event.target.value)} list="kenyan-registration-locations" autoComplete="address-level2" placeholder="e.g. Ongata Rongai" className="input pl-10" required />
              <datalist id="kenyan-registration-locations">{ALL_LOCATIONS.map((place) => <option key={place} value={place} />)}</datalist>
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Shown publicly so nearby drivers and owners can find you. {settings.site_name} operates in Kenya only.</p>
          </div>

          <div className="mt-4">
            <label className="label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                type={showPin ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 10 characters"
                className="input pl-10 pr-10"
                required
              />
              <button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Use at least 10 characters with uppercase, lowercase, and a number.</p>
          </div>

          <div className="mt-4">
            <label className="label">Confirm password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                type={showPin ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat password"
                className="input pl-10"
                required
              />
            </div>
            {confirmPin.length > 0 && pin !== confirmPin && (
              <p className="mt-1.5 text-xs text-danger">Passwords do not match.</p>
            )}
          </div>

          <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
            {loading ? 'Creating account…' : 'Create account'} <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-4 text-center text-xs text-ink-400">
            By continuing you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
