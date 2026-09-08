export const SITE_THEMES = [
  { id: 'heritage', name: '11Drive Heritage', description: 'Charcoal with warm copper actions.', swatches: ['#242424', '#b9470a', '#f6f6f6'] },
  { id: 'coastal', name: 'Coastal Blue', description: 'Deep navy with a vivid electric-blue accent.', swatches: ['#123743', '#13d0ff', '#eefcff'] },
  { id: 'electric', name: 'Electric Blue', description: 'Modern, confident, and technology focused.', swatches: ['#172554', '#2563eb', '#eff6ff'] },
  { id: 'royal', name: 'Royal Blue', description: 'A refined blue-indigo palette with a premium feel.', swatches: ['#172554', '#4f46e5', '#eef2ff'] },
  { id: 'emerald', name: 'Emerald', description: 'Fresh, clear, and trustworthy.', swatches: ['#064e3b', '#10b981', '#ecfdf5'] },
  { id: 'teal', name: 'Teal Drive', description: 'Modern mobility with a balanced teal accent.', swatches: ['#134e4a', '#14b8a6', '#f0fdfa'] },
  { id: 'tangerine', name: 'Tangerine', description: 'Warm, energetic, and action oriented.', swatches: ['#431407', '#f97316', '#fff7ed'] },
  { id: 'crimson', name: 'Crimson', description: 'A bold, high-confidence red palette.', swatches: ['#450a0a', '#e11d48', '#fff1f2'] },
  { id: 'violet', name: 'Violet', description: 'A modern purple palette with a creative edge.', swatches: ['#2e1065', '#7c3aed', '#f5f3ff'] },
  { id: 'cyan', name: 'Cyan', description: 'Youthful, bright, and technology focused.', swatches: ['#164e63', '#06b6d4', '#ecfeff'] },
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
