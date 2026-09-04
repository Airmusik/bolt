import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Lock, Eye, EyeOff, ArrowRight, Check, Mail, Languages, UserRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { BackButton } from '@/components/BackButton';
import { useSiteSettings } from '@/lib/siteSettings';
import { PlaceAutocomplete } from '@/components/PlaceAutocomplete';
import { isBroadNairobi, SPECIFIC_LOCATION_MESSAGE } from '@/lib/specificLocation';
import { SiteLogo } from '@/components/SiteLogo';
import { hasValidNameFields, normalizePersonName, parseLanguages, splitPersonName } from '@/lib/profileValidation';
import { PersonNameFields } from '@/components/PersonNameFields';
import { Modal } from '@/components/Modal';
import { TermsContent } from '@/components/TermsContent';
import { MemberSafetyNotice } from '@/components/MemberSafetyNotice';
import { TERMS_VERSION } from '@/lib/legal';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { GOOGLE_ROLE_KEY, googleAuthDestination, googleSetupError } from '@/lib/googleAuth';
import { supabase } from '@/lib/supabase';
import { isValidPhone, normalizePhone } from '@/lib/phoneAuth';

export function RegisterPage() {
  const { signUp, user, profile, registrationRequired, loading: authLoading, refreshProfile, signOut, profileError } = useAuth();
  const completingGoogle = Boolean(user && registrationRequired);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const [firstName, setFirstName] = useState('');
  const [secondName, setSecondName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [languages, setLanguages] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [role, setRole] = useState<'driver' | 'owner'>(() => {
    try { return sessionStorage.getItem(GOOGLE_ROLE_KEY) === 'owner' ? 'owner' : 'driver'; } catch { return 'driver'; }
  });
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !authLoading && profile) navigate(googleAuthDestination(profile, false), { replace: true });
  }, [user, authLoading, profile, navigate]);

  useEffect(() => {
    if (!completingGoogle || !user) return;
    setEmail(user.email);
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || data.user?.id !== user.id) return;
      const suppliedName = data.user.user_metadata.full_name;
      if (typeof suppliedName !== 'string') return;
      const names = splitPersonName(suppliedName);
      setFirstName(current => current || names.firstName);
      setSecondName(current => current || names.secondName);
    }).catch(() => { /* Name fields remain editable if this lookup fails. */ });
    return () => { active = false; };
  }, [completingGoogle, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || googleBusy || authLoading) return;
    setError(null);
    if (!acceptedTerms) { setError('Read and accept the Terms of Service before creating an account.'); return; }
    const fullName = normalizePersonName(`${firstName} ${secondName}`);
    if (!hasValidNameFields(firstName, secondName)) { setError('Enter both your first name and second name.'); return; }
    if (!completingGoogle && pin !== confirmPin) { setError('Passwords do not match. Please re-enter.'); return; }
    if (!isValidPhone(phone)) { setError('Enter a valid Kenyan phone number, e.g. 0712 345 678.'); return; }
    if (!email.trim()) { setError('Email address is required.'); return; }
    if (!location.trim()) { setError('Town or neighbourhood is required.'); return; }
    if (isBroadNairobi(location)) { setError(SPECIFIC_LOCATION_MESSAGE); return; }
    const selectedLanguages = parseLanguages(languages);
    if (selectedLanguages.length < 2) { setError('Add at least two languages you speak, separated with commas.'); return; }
    setLoading(true);
    try {
      if (completingGoogle) {
        const { error: setupError } = await supabase.rpc('complete_google_registration', {
          p_role: role, p_full_name: fullName, p_phone: normalizePhone(phone),
          p_location: location.trim(), p_languages: selectedLanguages,
          p_terms_version: TERMS_VERSION, p_accept_terms: acceptedTerms,
        });
        if (setupError) { setError(googleSetupError(setupError)); return; }
        try { sessionStorage.removeItem(GOOGLE_ROLE_KEY); } catch { /* Optional convenience only. */ }
        await refreshProfile();
        toast(role === 'driver' ? 'Account ready. Complete About You before your driver profile becomes public.' : `Welcome to ${settings.site_name}.`);
        navigate('/dashboard', { replace: true });
        return;
      }
      const result = await signUp(phone, pin, fullName, role, email, location, selectedLanguages, acceptedTerms ? TERMS_VERSION : null);
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

  if (authLoading || (user && !registrationRequired && !profile)) return (
    <div className="auth-page"><div className="auth-card w-full max-w-md text-center">
      {profileError ? <><p role="alert" className="text-ink-600">{profileError}</p><button type="button" onClick={() => void refreshProfile()} className="btn-primary mt-4">Try again</button><button type="button" onClick={() => void signOut()} className="btn-secondary mt-4">Sign out</button></> : <p role="status" className="text-ink-600">Loading your account…</p>}
    </div></div>
  );

  return (
    <div className="auth-page">
      <div className="w-full max-w-xl">
        <BackButton to="/" className="mb-2 min-h-11" />
        <div className="auth-heading">
          <Link to="/" aria-label={`${settings.site_name} home`} className="inline-flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
            <SiteLogo size="lg" />
          </Link>
          <h1 className="mt-3 font-display text-2xl font-bold text-ink-900 sm:text-3xl">{completingGoogle ? 'Finish your account setup' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-ink-500">{completingGoogle ? 'Google sign-in worked. Add your details and accept the terms to join.' : `Join ${settings.site_name} as a driver or car owner.`}</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-card" aria-busy={loading}>
          {error && <div role="alert" aria-live="polite" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {!completingGoogle && <GoogleSignInButton role={role} disabled={loading} onBusyChange={setGoogleBusy} onError={setError} />}
          {completingGoogle && <p className="mb-4 text-sm leading-6 text-ink-600">Your profile is not published yet. No new password is needed. <button type="button" className="font-semibold underline" onClick={() => void signOut()}>Use a different account</button></p>}
          <p className="mb-4 text-xs text-ink-500"><span className="font-bold text-danger">*</span> Required information</p>

          <fieldset>
            <legend className="label">I am a… <span className="text-danger">*</span></legend>
            <p className="mb-3 text-xs leading-5 text-ink-500">Choose how you will use {settings.site_name}.</p>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="Account type">
              {(['driver', 'owner'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`relative rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:p-4 ${role === r ? 'border-accent-500 bg-accent-50/70 dark:bg-accent-500/10' : 'border-ink-200 bg-white hover:border-ink-400 dark:bg-[#141416]'}`}
                >
                  <span className="block pr-5 text-sm font-semibold text-ink-900">{r === 'driver' ? 'Driver' : 'Car owner'}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-600">{r === 'driver' ? 'I need a car' : 'I need a driver'}</span>
                  {role === r && <Check className="absolute right-3 top-3 h-4 w-4 text-accent-600 dark:text-accent-400" />}
                </button>
              ))}
            </div>
          </fieldset>

          <div role="group" aria-labelledby="register-about" className="mt-6 border-t border-ink-100 pt-5">
            <h2 id="register-about" className="auth-section-title"><UserRound className="h-4 w-4 text-ink-500" /> Your details</h2>
            <PersonNameFields firstName={firstName} secondName={secondName} onFirstNameChange={setFirstName} onSecondNameChange={setSecondName} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="register-phone" className="label">Phone number <span className="text-danger">*</span></label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                  <input id="register-phone" aria-describedby="register-phone-hint" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" type="tel" autoComplete="tel" inputMode="tel" className="input pl-10" required />
                </div>
                <p id="register-phone-hint" className="auth-hint">Your active Kenyan mobile number.</p>
              </div>
              <div>
                <label htmlFor="register-email" className="label">Email address <span className="text-danger">*</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                  <input id="register-email" aria-describedby="register-email-hint" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" placeholder="you@example.com" className="input pl-10" readOnly={completingGoogle} required />
                </div>
                <p id="register-email-hint" className="auth-hint">{completingGoogle ? 'From your Google account. Not shown publicly.' : 'For sign-in and password recovery. Not shown publicly.'}</p>
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="register-location" className="label">Residential area <span className="text-danger">*</span></label>
              <PlaceAutocomplete requireSpecificArea id="register-location" ariaLabel="Residential area" typingHint="Choose the neighborhood or town where you live, not your workplace. Shown on your profile to help nearby members find you. Kenya only." value={location} onChange={setLocation} placeholder="e.g. Ongata Rongai" required />
            </div>

            <div className="mt-4">
              <label htmlFor="register-languages" className="label">Languages spoken <span className="text-danger">*</span></label>
              <div className="relative">
                <Languages className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input id="register-languages" aria-describedby="register-languages-hint" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="English, Swahili" className="input pl-10" required />
              </div>
              <p id="register-languages-hint" className="auth-hint">At least two languages you speak, separated by commas.</p>
            </div>
          </div>

          {!completingGoogle && <div role="group" aria-labelledby="register-security" className="mt-6 border-t border-ink-100 pt-5">
            <h2 id="register-security" className="auth-section-title"><Lock className="h-4 w-4 text-ink-500" /> Account security</h2>
            <div>
              <label htmlFor="register-password" className="label">Password <span className="text-danger">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  id="register-password"
                  aria-describedby="register-password-hint"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  type={showPin ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="At least 10 characters"
                  className="input pl-10 pr-12"
                  required
                />
                <button type="button" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? 'Hide password' : 'Show password'} aria-pressed={showPin} className="password-toggle">
                  {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              <p id="register-password-hint" className="auth-hint">At least 10 characters, including uppercase, lowercase, and a number.</p>
            </div>

            <div className="mt-4">
              <label htmlFor="register-confirm-password" className="label">Confirm password <span className="text-danger">*</span></label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  id="register-confirm-password"
                  aria-describedby="register-confirm-hint"
                  aria-invalid={confirmPin.length > 0 && pin !== confirmPin}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value)}
                  type={showPin ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  className="input pl-10"
                  required
                />
              </div>
              <p id="register-confirm-hint" className={`auth-hint ${confirmPin.length > 0 && pin !== confirmPin ? 'text-danger' : ''}`}>{confirmPin.length > 0 && pin !== confirmPin ? 'Passwords do not match.' : 'Enter the same password again.'}</p>
            </div>
          </div>}
          <div role="group" aria-labelledby="register-terms" className="mt-6 border-t border-ink-100 pt-5">
            <h2 id="register-terms" className="auth-section-title">Before you join</h2>
            <MemberSafetyNotice />
            <div className="mt-5 rounded-xl border border-ink-200 p-4">
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm"><button type="button" onClick={() => setShowTerms(true)} className="min-h-11 font-semibold text-ink-800 underline">Read Terms of Service</button><Link to="/privacy" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-ink-800 underline">Privacy Policy ↗</Link></div>
              <label className="mt-2 flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink-800"><input id="accept-terms" type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} required className="mt-1 h-5 w-5 shrink-0 accent-orange-600" /><span>I am at least 18, have read and accept the Terms of Service, including my responsibility to check the other member and the limits of the platform's role, and acknowledge the Privacy Policy. <span className="text-danger">*</span></span></label>
              <p className="mt-2 text-xs text-ink-500">Required · Terms version {TERMS_VERSION}. This does not waive your statutory rights or consent to marketing. Opening the terms keeps your form entries intact.</p>
            </div>
          </div>
          <button type="submit" disabled={loading || googleBusy || !acceptedTerms} className="btn-primary mt-6 min-h-12 w-full">
            {loading ? 'Saving account…' : completingGoogle ? 'Complete account setup' : 'Create account'} {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          </button>
          {!acceptedTerms && <p className="auth-hint text-center">Accept the terms above to create your account.</p>}
        </form>
        {showTerms && <Modal title="Terms of Service" size="xl" onClose={() => setShowTerms(false)}><TermsContent /><button type="button" onClick={() => setShowTerms(false)} className="btn-secondary mt-5 w-full">Back to registration</button></Modal>}

        {!completingGoogle && <p className="mt-4 text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link to="/login" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline-offset-4 hover:underline">Sign in</Link>
        </p>}
      </div>
    </div>
  );
}
