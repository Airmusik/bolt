export const SITE_THEMES = [
  { id: 'heritage', name: '11Drive Heritage', description: 'Charcoal with warm copper actions.', swatches: ['#242424', '#b9470a', '#f6f6f6'] },
  { id: 'coastal', name: 'Coastal Blue', description: 'Deep navy with a clear blue accent.', swatches: ['#172536', '#276b91', '#f3f6f8'] },
  { id: 'forest', name: 'Forest Road', description: 'Graphite with a restrained forest green.', swatches: ['#202724', '#397159', '#f3f6f4'] },
  { id: 'clay', name: 'Clay & Ink', description: 'Soft black with an earthy terracotta accent.', swatches: ['#272321', '#a64f38', '#f7f3ef'] },
  { id: 'graphite', name: 'Graphite Grey', description: 'Layered greys with a crisp steel accent.', swatches: ['#30343b', '#66717f', '#f1f3f5'] },
  { id: 'silver', name: 'Silver Blue', description: 'Cool grey balanced with a muted denim blue.', swatches: ['#343b45', '#55738f', '#eef2f5'] },
  { id: 'burgundy', name: 'Burgundy Road', description: 'Deep charcoal with a mature wine-red accent.', swatches: ['#292527', '#8c3f50', '#f6f1f2'] },
  { id: 'aubergine', name: 'Aubergine Night', description: 'Near-black plum with a restrained purple accent.', swatches: ['#2d2830', '#76546f', '#f5f1f5'] },
  { id: 'sandstone', name: 'Sandstone', description: 'Warm grey with a subtle golden-brown accent.', swatches: ['#34312d', '#8a6a3f', '#f6f3ed'] },
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
