import type { PlatformHistory } from './types';

export function historyState(item: Pick<PlatformHistory, 'review_status' | 'approved' | 'proof_url' | 'expires_at'>, now = Date.now()) {
  const state = item.review_status || (item.approved ? 'approved' : item.proof_url ? 'pending' : 'draft');
  return state === 'approved' && item.expires_at && Date.parse(item.expires_at) <= now ? 'expired' : state;
}

export function historyCanEdit(item: PlatformHistory, items: PlatformHistory[], now = Date.now()) {
  return !items.some(entry => historyState(entry, now) === 'pending') && ['draft', 'expired', 'rejected'].includes(historyState(item, now));
}

export function expiryCountdown(expiresAt: string, now = Date.now()) {
  const remaining = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remaining)) return 'Expiry date unavailable';
  if (remaining <= 0) return 'Expired — renewal required';
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h remaining` : hours > 0 ? `${hours}h remaining` : 'Less than 1 hour remaining';
}
