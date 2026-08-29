import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Lock, User, Eye, EyeOff, ArrowRight, Check, Mail } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { BackButton } from '@/components/BackButton';
import type { Role } from '@/lib/types';
import { useSiteSettings } from '@/lib/siteSettings';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { SiteLogo } from '@/components/SiteLogo';

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
        toast(role === 'driver' ? 'Account created. Confirm your email, then complete About You. Your driver profile stays private until that is done.' : 'Account created. Check your email to confirm it before signing in.');
        navigate('/login');
      } else {
        toast(role === 'driver' ? 'Account created. Complete About You now—your driver profile is not public until you save it.' : `Account created. Welcome to ${settings.site_name}.`);
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
            <SiteLogo size="lg" />
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Create your account</h1>
          <p className="mt-1 text-sm text-ink-500">Join {settings.site_name} as a driver or car owner.</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6">
          {error && <div role="alert" aria-live="polite" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <p className="mb-4 text-xs text-ink-400"><span className="font-bold text-danger">*</span> Required information</p>

          <div className="mb-5">
            <label className="label">I am a… <span className="text-danger">*</span></label>
            <p className="mb-2 text-xs text-ink-400">Choose Driver if you need a vehicle, or Owner if you want to list a vehicle.</p>
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
            <label className="label">Full name <span className="text-danger">*</span></label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="input pl-10" required />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Use the name other members will recognise on your profile.</p>
          </div>
          <div className="mt-4">
            <label className="label">Phone number <span className="text-danger">*</span></label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" inputMode="tel" className="input pl-10" required />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">Enter an active Kenyan number, for example 0712 345 678.</p>
          </div>
          <div className="mt-4">
            <label className="label">Email <span className="text-danger">*</span></label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" className="input pl-10" required />
            </div>
            <p className="mt-1.5 text-xs text-ink-400">You will use this email to sign in and reset your password.</p>
          </div>
          <div className="mt-4">
            <label className="label">Town or neighbourhood <span className="text-danger">*</span></label>
            <PlaceAutocomplete value={location} onChange={setLocation} placeholder="e.g. Ongata Rongai" required />
            <p className="mt-1.5 text-xs text-ink-400">Shown publicly so nearby drivers and owners can find you. {settings.site_name} operates in Kenya only.</p>
          </div>

          <div className="mt-4">
            <label className="label">Password <span className="text-danger">*</span></label>
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
            <label className="label">Confirm password <span className="text-danger">*</span></label>
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
            <p className="mt-1.5 text-xs text-ink-400">Type the same password again to prevent mistakes.</p>
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
