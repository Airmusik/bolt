import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from './supabase';
import { phoneToEmail, normalizePhone, isValidPin, isValidPhone, pinToPassword } from './phoneAuth';
import type { Profile, Role } from './types';

interface AuthContextValue {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (phone: string, pin: string, fullName: string, role: Role, email?: string) => Promise<{ error: string | null }>;
  signIn: (phone: string, pin: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPin: (phone: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();
    if (error) {
      console.error('profile load error', error);
      return;
    }
    if (data) {
      setProfile(data as Profile);
    } else {
      // profile row missing — create a minimal one
      const { data: created } = await supabase
        .from('profiles')
        .insert({ id: uid, role: 'driver', full_name: '' })
        .select()
        .maybeSingle();
      if (created) setProfile(created as Profile);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
      if (u) {
        loadProfile(u.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        const u = session?.user ?? null;
        setUser(u ? { id: u.id, email: u.email ?? '' } : null);
        if (u && event !== 'SIGNED_OUT') {
          await loadProfile(u.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback<AuthContextValue['signUp']>(async (phone, pin, fullName, role, userEmail) => {
    if (!isValidPhone(phone)) return { error: 'Enter a valid Kenyan phone number (e.g. 0712 345 678).' };
    if (!isValidPin(pin)) return { error: 'PIN must be exactly 4 digits.' };

    const password = pinToPassword(pin);
    if (!fullName.trim()) return { error: 'Please enter your full name.' };

    const email = phoneToEmail(phone);
    const normalized = normalizePhone(phone);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role, phone: normalized } },
    });
    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return { error: 'An account with this phone number already exists. Try signing in.' };
      }
      return { error: error.message };
    }
    if (data.user) {
      // create profile row
      await supabase.from('profiles').upsert({
        id: data.user.id,
        role,
        full_name: fullName,
        phone: normalized,
        email: userEmail || null,
      });
    }
    return { error: null };
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (phone, pin) => {
    if (!isValidPhone(phone)) return { error: 'Enter a valid Kenyan phone number.' };
    if (!isValidPin(pin)) return { error: 'PIN must be exactly 4 digits.' };
    const email = phoneToEmail(phone);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pinToPassword(pin) });
    if (error) {
      return { error: 'Wrong phone number or PIN. Please try again.' };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const resetPin = useCallback<AuthContextValue['resetPin']>(async (phone) => {
    if (!isValidPhone(phone)) return { error: 'Enter a valid Kenyan phone number.' };
    const email = phoneToEmail(phone);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login?reset=1`,
    });
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile, resetPin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
