import { useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { supabase } from './supabase';
import { normalizePhone, isValidEmail, isValidPin, isValidPhone, pinToPassword } from './phoneAuth';
import { getAuthErrorMessage } from './authErrors';
import type { Profile } from './types';
import { AuthContext, type AuthContextValue } from './authContext';
import { createDemoAdminProfile, DEMO_ADMIN_EMAIL, DEMO_ADMIN_ID, DEMO_ADMIN_SESSION_KEY, DEMO_MODE } from './demoMode';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthContextValue['user']>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const activeUserId = useRef<string | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase.rpc('get_my_profile');
    if (error) {
      console.error('profile load error', error);
      return;
    }
    const current = Array.isArray(data) ? data[0] : data;
    if (current) {
      if (activeUserId.current === uid) setProfile(current as Profile);
      return;
    } else {
      // profile row missing — create a minimal one
      const { error: createError } = await supabase
        .from('profiles')
        .insert({ id: uid, role: 'driver', full_name: '' });
      if (!createError) {
        const { data: created } = await supabase.rpc('get_my_profile');
        const createdProfile = Array.isArray(created) ? created[0] : created;
        if (createdProfile && activeUserId.current === uid) setProfile(createdProfile as Profile);
      }
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await loadProfile(user.id);
  }, [user, loadProfile]);

  useEffect(() => {
    let mounted = true;
    if (DEMO_MODE && localStorage.getItem(DEMO_ADMIN_SESSION_KEY) === 'active') {
      activeUserId.current = DEMO_ADMIN_ID;
      setUser({ id: DEMO_ADMIN_ID, email: DEMO_ADMIN_EMAIL });
      setProfile(createDemoAdminProfile());
      setLoading(false);
      return () => { mounted = false; };
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      activeUserId.current = u?.id ?? null;
      setProfile(null);
      setUser(u ? { id: u.id, email: u.email ?? '' } : null);
      if (u) {
        loadProfile(u.id).finally(() => {
          if (mounted && activeUserId.current === u.id) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        const u = session?.user ?? null;
        const uid = u?.id ?? null;
        activeUserId.current = uid;
        setLoading(true);
        setProfile(null);
        setUser(u ? { id: u.id, email: u.email ?? '' } : null);
        if (u && event !== 'SIGNED_OUT') {
          await loadProfile(u.id);
        }
        if (mounted && activeUserId.current === uid) setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signUp = useCallback<AuthContextValue['signUp']>(async (phone, pin, fullName, role, userEmail, userLocation) => {
    if (!isValidPhone(phone)) return { error: 'Enter a valid Kenyan phone number (e.g. 0712 345 678).' };
    if (!isValidPin(pin)) return { error: 'Password must be at least 10 characters and include uppercase, lowercase, and a number.' };
    if (!fullName.trim()) return { error: 'Please enter your full name.' };
    if (!isValidEmail(userEmail)) return { error: 'Enter a valid email address, for example name@example.com.' };
    if (userLocation.trim().length < 2) return { error: 'Enter your town or neighbourhood, for example Ongata Rongai.' };

    const password = pinToPassword(pin);
    const email = userEmail.trim().toLowerCase();
    const normalized = normalizePhone(phone);

    try {
      const { data: phoneAvailable, error: phoneCheckError } = await supabase.rpc('is_signup_phone_available', { p_phone: normalized });
      if (!phoneCheckError && phoneAvailable === false) {
        return { error: 'This phone number is already registered. Sign in instead of creating another account.' };
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName.trim(), role, phone: normalized, email, location: userLocation.trim() } },
      });
      if (error) return { error: getAuthErrorMessage(error, 'signup') };

      // Supabase may obscure duplicate-email attempts by returning a user with
      // no identities. Treat that as an existing account instead of success.
      if (data.user && data.user.identities?.length === 0) {
        return { error: 'This email address is already registered. Sign in instead, or reset your password.' };
      }

      // With email confirmation enabled there is no authenticated session yet,
      // so the database trigger creates the profile from auth metadata.
      if (data.user && data.session) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: data.user.id,
          role,
          full_name: fullName.trim(),
          phone: normalized,
          email,
          location: userLocation.trim(),
        });
        if (profileError) {
          console.error('profile setup error', profileError);
          return { error: getAuthErrorMessage(profileError, 'profile') };
        }
      }
      return { error: null, requiresEmailConfirmation: !data.session };
    } catch (error) {
      console.error('signup error', error);
      return { error: getAuthErrorMessage(error, 'signup') };
    }
  }, []);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, pin) => {
    if (!isValidEmail(email)) return { error: 'Enter a valid email address.' };
    if (!isValidPin(pin)) return { error: 'Enter your password (at least 10 characters).' };
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pinToPassword(pin) });
      if (error) return { error: getAuthErrorMessage(error, 'signin') };
      return { error: null };
    } catch (error) {
      console.error('signin error', error);
      return { error: getAuthErrorMessage(error, 'signin') };
    }
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    activeUserId.current = null;
    setUser(null);
    setProfile(null);
    if (DEMO_MODE) {
      localStorage.removeItem(DEMO_ADMIN_SESSION_KEY);
      setLoading(false);
      return;
    }
    await supabase.auth.signOut();
    setLoading(false);
  }, []);

  const resetPin = useCallback<AuthContextValue['resetPin']>(async (email) => {
    if (!isValidEmail(email)) return { error: 'Enter a valid email address.' };
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/login?reset=1`,
      });
      if (error) return { error: getAuthErrorMessage(error, 'reset') };
      return { error: null };
    } catch (error) {
      console.error('password reset error', error);
      return { error: getAuthErrorMessage(error, 'reset') };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading, signUp, signIn, signOut, refreshProfile, resetPin }}>
      {children}
    </AuthContext.Provider>
  );
}
