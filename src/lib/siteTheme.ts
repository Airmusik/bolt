export const SITE_THEMES = [
  { id: 'heritage', name: '11Drive Heritage', description: 'Charcoal with warm copper actions.', swatches: ['#242424', '#b9470a', '#f6f6f6'] },
  { id: 'coastal', name: 'Coastal Blue', description: 'Deep navy with a clear blue accent.', swatches: ['#172536', '#276b91', '#f3f6f8'] },
  { id: 'forest', name: 'Forest Road', description: 'Graphite with a restrained forest green.', swatches: ['#202724', '#397159', '#f3f6f4'] },
  { id: 'clay', name: 'Clay & Ink', description: 'Soft black with an earthy terracotta accent.', swatches: ['#272321', '#a64f38', '#f7f3ef'] },
] as const;

export type SiteThemeId = typeof SITE_THEMES[number]['id'];
export const DEFAULT_SITE_THEME: SiteThemeId = 'heritage';
const THEME_CACHE_KEY = '11drive-site-theme';

export function isSiteTheme(value: string | null | undefined): value is SiteThemeId {
  return SITE_THEMES.some((theme) => theme.id === value);
}

export function applySiteTheme(value: string | null | undefined, persist = false) {
  const theme = isSiteTheme(value) ? value : DEFAULT_SITE_THEME;
  document.documentElement.dataset.siteTheme = theme;
  if (persist) localStorage.setItem(THEME_CACHE_KEY, theme);
  return theme;
}

export function applyCachedSiteTheme() {
  try { applySiteTheme(localStorage.getItem(THEME_CACHE_KEY)); }
  catch { applySiteTheme(DEFAULT_SITE_THEME); }
}
