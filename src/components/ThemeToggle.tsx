import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, type Theme } from '@/lib/theme';

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light');

  useEffect(() => {
    const sync = (event: Event) => setTheme((event as CustomEvent<Theme>).detail);
    window.addEventListener('garilink-theme-change', sync);
    return () => window.removeEventListener('garilink-theme-change', sync);
  }, []);

  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" onClick={() => { applyTheme(next); setTheme(next); }} className="inline-flex items-center gap-2 rounded-full p-2 text-ink-600 transition hover:rotate-6 hover:bg-ink-100 hover:text-ink-900" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      {showLabel && <span className="text-sm font-medium">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
