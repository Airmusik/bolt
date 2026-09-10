export const ADMIN_TABS = ['overview', 'members', 'updates', 'content', 'security', 'cars', 'contact', 'feedback', 'chat', 'community', 'reviews', 'reports', 'analytics', 'promotions', 'advertisements', 'assistant', 'settings', 'drivers', 'owners'] as const;
export type AdminTab = typeof ADMIN_TABS[number];
export type LegacyAdminTab = 'controls' | 'documents' | 'history' | 'expired';
export type ReviewSection = 'history' | 'files' | 'expired';
export type SettingsSection = 'branding' | 'controls';

export function canonicalAdminTab(value: string | null): AdminTab {
  if (value === 'controls') return 'settings';
  if (value === 'documents' || value === 'history' || value === 'expired') return 'reviews';
  return ADMIN_TABS.includes(value as AdminTab) ? value as AdminTab : 'overview';
}

export function adminView(params: URLSearchParams) {
  const requested = params.get('tab');
  const tab = canonicalAdminTab(requested);
  const reviewValue = requested === 'documents' ? 'files' : requested === 'history' || requested === 'expired' ? requested : params.get('review');
  const review: ReviewSection = reviewValue === 'files' || reviewValue === 'expired' ? reviewValue : 'history';
  const settings: SettingsSection = requested === 'controls' || params.get('settings') === 'controls' ? 'controls' : 'branding';
  return { tab, review, settings };
}

export function canonicalAdminParams(params: URLSearchParams) {
  const next = new URLSearchParams(params);
  const { tab, review, settings } = adminView(params);
  next.set('tab', tab);
  if (tab === 'reviews') next.set('review', review); else next.delete('review');
  if (tab === 'settings') next.set('settings', settings); else next.delete('settings');
  return next;
}

export function adminDestination(current: URLSearchParams, tab: AdminTab | LegacyAdminTab) {
  const next = new URLSearchParams(current);
  next.set('tab', tab);
  next.delete('review'); next.delete('settings');
  return canonicalAdminParams(next);
}

export function adminNavOrder(saved: string, available: readonly AdminTab[]): AdminTab[] {
  // Keep the first saved position when several older sections now share one home.
  const mapped = saved.split(',').map(key => key.trim())
    .filter(key => ADMIN_TABS.includes(key as AdminTab) || ['controls', 'documents', 'history', 'expired'].includes(key))
    .map(key => canonicalAdminTab(key));
  return [...new Set([...mapped, ...available])].filter(key => available.includes(key));
}
