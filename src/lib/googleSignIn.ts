import { supabase } from './supabase';
import { googleCallbackUrl, GOOGLE_ROLE_KEY } from './googleAuth';

export async function isGoogleSignInEnabled(signal?: AbortSignal): Promise<boolean> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    signal,
  });
  if (!response.ok) throw new Error('Could not check sign-in options.');
  const settings = await response.json();
  return settings.external?.google === true;
}

export async function startGoogleSignIn(role?: 'driver' | 'owner') {
  // A convenience only, never an authority for role assignment. The database
  // validates the member's explicit choice on the completion form.
  try {
    if (role) sessionStorage.setItem(GOOGLE_ROLE_KEY, role);
    else sessionStorage.removeItem(GOOGLE_ROLE_KEY);
  } catch { /* Sign-in also works when browser storage is restricted. */ }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: googleCallbackUrl(window.location.origin),
      scopes: 'openid email profile',
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}
