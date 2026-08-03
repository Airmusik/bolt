import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Phone, Lock, Eye, EyeOff, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import { phoneToEmail, normalizePhone, isValidPhone, pinToPassword } from '@/lib/phoneAuth';

export function AdminLoginPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      navigate('/admin', { replace: true });
    }
  }, [user, profile, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(phone)) {
      setError('Enter a valid Kenyan phone number.');
      return;
    }
    if (pin.length !== 4) {
      setError('PIN must be exactly 4 digits.');
      return;
    }
    setLoading(true);

    const email = phoneToEmail(phone);
    const password = pinToPassword(pin);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError('Invalid admin credentials.');
      setLoading(false);
      return;
    }

    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user?.id;
    if (!uid) {
      setError('Sign-in failed. Please try again.');
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle();
    if (!prof || prof.role !== 'admin') {
      await supabase.auth.signOut();
      setError('This account does not have admin access.');
      setLoading(false);
      return;
    }

    toast('Welcome to the admin portal.');
    navigate('/admin');
    setLoading(false);
  };

  return (
    <div className="container-content flex min-h-[80vh] items-center justify-center py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white">
              <ShieldCheck className="h-6 w-6" />
            </span>
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-900">Admin Portal</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in with your admin phone number and PIN.</p>
        </div>

        <form onSubmit={handleSignIn} className="card p-6">
          {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
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
            {loading ? 'Signing in…' : 'Sign in to admin'} <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
            <ArrowLeft className="h-4 w-4" /> Back to GariLink
          </Link>
        </div>
      </div>
    </div>
  );
}
