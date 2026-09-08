import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISSED_AT_KEY = '11drive-install-prompt-dismissed-at';
const COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

export function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(standalone);
    if (standalone) return;

    const ready = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallEvent);
    };
    const done = () => { setInstalled(true); setVisible(false); };
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);

    let dismissedAt = 0;
    try { dismissedAt = Number(localStorage.getItem(DISMISSED_AT_KEY)) || 0; } catch { /* Optional cooldown only. */ }
    const eligible = Date.now() - dismissedAt >= COOLDOWN_MS;
    const timer = eligible ? window.setTimeout(() => setVisible(true), 4500) : undefined;

    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', ready);
      window.removeEventListener('appinstalled', done);
    };
  }, []);

  if (installed || !visible) return null;

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISSED_AT_KEY, String(Date.now())); } catch { /* Prompt may return next session. */ }
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setVisible(false);
    else dismiss();
  };

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-md rounded-2xl border border-ink-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-[#17171a]/95 sm:inset-x-auto sm:bottom-5 sm:right-5" role="dialog" aria-label="Install 11Drive">
      <button type="button" onClick={dismiss} className="absolute right-2 top-2 rounded-full p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-800" aria-label="Dismiss install prompt"><X className="h-4 w-4" /></button>
      <div className="flex items-start gap-3 pr-7">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Smartphone className="h-5 w-5" /></span>
        <div className="min-w-0"><h2 className="font-display font-bold text-ink-900">Get the 11Drive app</h2><p className="mt-1 text-sm leading-5 text-ink-500">Install it on your phone for quicker access and a full-screen experience.</p></div>
      </div>
      {installEvent
        ? <button type="button" onClick={() => void install()} className="btn-primary mt-4 w-full"><Download className="h-4 w-4" /> Install app</button>
        : <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-xs leading-5 text-ink-600">Open your browser menu and choose <strong>Add to Home screen</strong>.</p>}
    </aside>
  );
}
