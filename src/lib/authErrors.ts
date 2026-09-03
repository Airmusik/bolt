type AuthAction = 'signup' | 'signin' | 'resetRequest' | 'passwordUpdate' | 'profile';

export const LOGIN_REGISTRATION_GUIDANCE = 'Unable to sign in. Check your email and password. If you have not registered with 11Drive, create an account first.';

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message).toLowerCase();
  }
  return String(error ?? '').toLowerCase();
}

export function getAuthErrorMessage(error: unknown, action: AuthAction): string {
  const message = errorText(error);

  if (message.includes('invalid email') || message.includes('email address') && message.includes('invalid')) {
    return 'Enter a valid email address, for example name@example.com.';
  }
  if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
    return 'This email address is already registered. Sign in instead, or reset your password.';
  }
  if (message.includes('weak password') || message.includes('password should') || message.includes('password must')) {
    return 'Use at least 10 characters with uppercase, lowercase, and a number.';
  }
  if (message.includes('rate limit') || message.includes('too many requests') || message.includes('over_email_send_rate_limit')) {
    return 'Too many attempts. Wait a few minutes, then try again.';
  }
  if (message.includes('email not confirmed')) {
    return 'Confirm your email using the link we sent you, then sign in.';
  }
  if (action === 'passwordUpdate' && (message.includes('auth session missing') || message.includes('session expired') || message.includes('invalid jwt') || message.includes('otp expired') || message.includes('expired'))) {
    return 'This password-reset link is invalid or has expired. Request a new link and try again.';
  }
  if (message.includes('invalid login credentials')) {
    return LOGIN_REGISTRATION_GUIDANCE;
  }
  if (message.includes('signup is disabled') || message.includes('signups not allowed')) {
    return 'New account registration is temporarily unavailable. Please contact platform support.';
  }
  if (message.includes('database error saving new user') || message.includes('unexpected_failure')) {
    return 'Account creation could not finish. Reload the registration page, check your details and accept the current terms, then retry. If this continues, contact support.';
  }
  if (message.includes('failed to fetch') || message.includes('network') || message.includes('fetch')) {
    return 'Could not reach the platform. Check your internet connection and try again.';
  }
  if (action === 'profile') {
    return 'Your account was created, but profile setup could not finish. Sign in to continue or contact support.';
  }
  if (action === 'signin') return 'Could not sign in right now. Please try again.';
  if (action === 'resetRequest') return 'Could not send the reset email right now. Please try again.';
  if (action === 'passwordUpdate') return 'Could not update your password right now. Request a new reset link and try again.';
  return 'Could not create your account right now. Please try again.';
}
