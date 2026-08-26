export function normalizePhone(phone: string): string {
  let normalized = phone.replace(/[^\d+]/g, '');
  if (normalized.startsWith('+')) normalized = normalized.slice(1);
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('0')) normalized = `254${normalized.slice(1)}`;
  if (normalized.length === 9) normalized = `254${normalized}`;
  return `+${normalized}`;
}

export function isValidPin(password: string): boolean {
  return password.length >= 10
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

export function isValidPhone(phone: string): boolean {
  return /^\+254\d{9}$/.test(normalizePhone(phone));
}

export function isValidEmail(email: string): boolean {
  // This intentionally catches common input mistakes; Supabase remains the
  // authoritative validator for the complete email specification.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Kept as a compatibility name for existing callers; no fixed prefix is used. */
export function pinToPassword(password: string): string {
  return password;
}
