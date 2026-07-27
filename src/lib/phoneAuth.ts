// Phone + PIN auth helper.
// Maps a phone number to a derived email and uses the PIN as the password,
// so we can use Supabase's built-in email/password auth while presenting a
// phone+PIN UX to the user.
//
// The user only ever sees and types a 4-digit PIN. Supabase requires
// passwords of at least 6 characters, so we pad the PIN with a fixed prefix
// ("gl") before sending it to Supabase. This is transparent to the user.

const PIN_PREFIX = 'gl';

export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@garilink.app`;
}

export function normalizePhone(phone: string): string {
  let p = phone.replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0')) p = '254' + p.slice(1);
  if (p.length === 9) p = '254' + p;
  return '+' + p;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function isValidPhone(phone: string): boolean {
  const p = normalizePhone(phone);
  return /^\+254\d{9}$/.test(p);
}

// Pads the 4-digit PIN to meet Supabase's 6-char password minimum.
export function pinToPassword(pin: string): string {
  return `${PIN_PREFIX}${pin}`;
}
