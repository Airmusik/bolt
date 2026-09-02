export const GOOGLE_ROLE_KEY = 'drivevell.google-signup-role';

export function googleCallbackUrl(origin: string) {
  return new URL('/auth/callback', origin).href;
}

export function googleAuthDestination(profile: { role: string; is_suspended?: boolean } | null, registrationRequired: boolean) {
  if (registrationRequired) return '/register';
  if (profile?.is_suspended) return '/suspended';
  return profile?.role === 'admin' ? '/admin' : '/dashboard';
}

// Never render provider-supplied descriptions or tokens in an error message.
export function googleCallbackError(search: string, hash: string): string | null {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const code = query.get('error') || fragment.get('error');
  if (!code && !query.has('error_code') && !fragment.has('error_code')) return null;
  if (code === 'access_denied') return 'Google sign-in was cancelled or access was not granted. You can try again or use email and password.';
  return 'Google sign-in could not finish. Please try again or use email and password.';
}

export function googleSetupError(error: { code?: string; message?: string }) {
  if (error.code === '23505' || error.message?.includes('phone number is already registered')) return 'This phone number is already registered. Sign in to that account or contact support.';
  if (error.message?.includes('Accept the current')) return 'The terms have changed. Reload, review the current terms and accept them again.';
  if (error.message?.includes('already complete')) return 'This account is already set up. Open your dashboard or sign out to use another account.';
  return 'Could not finish your account setup. Check your details and connection, then try again. Your Google account is still signed in.';
}
