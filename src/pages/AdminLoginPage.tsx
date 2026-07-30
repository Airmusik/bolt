import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck, Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, UserPlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';

const ADMIN_EMAIL = 'admin@garilink.app';

export function AdminLoginPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'setup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPw, setShowPw] = useState(false);
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
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!fullName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName, role: 'admin' } },
    });
    if (signUpError) {
      if (signUpError.message.toLowerCase().includes('already')) {
        setError('An admin account already exists. Use sign-in instead.');
      } else {
        setError(signUpError.message);
      }
      setLoading(false);
      return;
    }
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role: 'admin',
        full_name: fullName,
      });
    }
    toast('Admin account created. You can now sign in.');
    setMode('signin');
    setPassword('');
    setConfirmPassword('');
    setFullName('');
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
          <p className="mt-1 text-sm text-ink-500">
            {mode === 'signin' ? 'Sign in with your admin email and password.' : 'Create the admin account for first-time setup.'}
          </p>
        </div>

        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className="card p-6">
            {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div>
              <label className="label">Admin email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="admin@garilink.app"
                  className="input pl-10"
                  required
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Enter password"
                  className="input pl-10 pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
              {loading ? 'Signing in…' : 'Sign in to admin'} <ArrowRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => { setMode('setup'); setError(null); setEmail(ADMIN_EMAIL); }}
              className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <UserPlus className="h-4 w-4" /> First-time setup? Create admin account
            </button>
          </form>
        ) : (
          <form onSubmit={handleSetup} className="card p-6">
            {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div>
              <label className="label">Admin email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="admin@garilink.app"
                  className="input pl-10"
                  required
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Site Admin"
                className="input"
                required
              />
            </div>
            <div className="mt-4">
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  className="input pl-10 pr-10"
                  required
                />
                <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700">
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="mt-4">
              <label className="label">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type={showPw ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  className="input pl-10"
                  required
                />
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary mt-6 w-full">
              {loading ? 'Creating account…' : 'Create admin account'} <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); }}
              className="mt-4 w-full text-center text-sm text-ink-500 hover:text-ink-800"
            >
              Already have an admin account? Sign in
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-800">
            <ArrowLeft className="h-4 w-4" /> Back to GariLink
          </Link>
        </div>
      </div>
    </div>
  );
}
