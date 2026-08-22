import { useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from './supabase';
import { phoneToEmail, normalizePhone, isValidPin, isValidPhone, pinToPassword } from './phoneAuth';
import type { Profile } from './types';
import { AuthContext, type AuthContextValue } from './authContext';
import { createDemoAdminProfile, DEMO_ADMIN_EMAIL, DEMO_ADMIN_ID, DEMO_ADMIN_SESSION_KEY, DEMO_MODE } from './demoMode';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error) {
      console.error('profile load error', error);
      return;
    }
    const current = Array.isArray(data) ? data[0] : data;
    if (current) {
      setProfile(current as Profile);
    } else {
      // profile row missing — create a minimal one
      const { error: createError } = await supabase
        .from('profiles')
        .insert({ id: uid, role: 'driver', full_name: '' });
      if (!createError) {
        const { data: created } = await supabase.rpc('get_my_profile');
        const createdProfile = Array.isArray(created) ? created[0] : created;
        if (createdProfile) setProfile(createdProfile as Profile);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    let mounted = true;
    if (DEMO_MODE && localStorage.getItem(DEMO_ADMIN_SESSION_KEY) === 'active') {
      setUser({ id: DEMO_ADMIN_ID, email: DEMO_ADMIN_EMAIL });
      setProfile(createDemoAdminProfile());
      setLoading(false);
      return () => { mounted = false; };
    }
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
    if (!isValidPin(pin)) return { error: 'Password must be at least 10 characters and include uppercase, lowercase, and a number.' };

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
    if (!isValidPin(pin)) return { error: 'Enter your password (at least 10 characters).' };
    const email = phoneToEmail(phone);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pinToPassword(pin) });
    if (error) {
      return { error: 'Wrong phone number or password. Please try again.' };
    }
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (DEMO_MODE) {
      localStorage.removeItem(DEMO_ADMIN_SESSION_KEY);
      setUser(null);
      setProfile(null);
      return;
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const resetPin = useCallback<AuthContextValue['resetPin']>(async (phone) => {
    if (!isValidPhone(phone)) return { error: 'Enter a valid Kenyan phone number.' };
    normalizePhone(phone);
    return { error: 'For account security, please contact GariLink support to reset your password.' };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile, resetPin }}>
      {children}
    </AuthContext.Provider>
  );
}
