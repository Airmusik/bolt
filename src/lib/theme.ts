export type Theme = 'light' | 'dark';

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  localStorage.setItem('garilink-theme', theme);
  window.dispatchEvent(new CustomEvent('garilink-theme-change', { detail: theme }));
}

export function getInitialTheme(): Theme {
  const saved = localStorage.getItem('garilink-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
