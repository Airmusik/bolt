import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSiteSettings } from '@/lib/siteSettings';
import { useAuth } from '@/lib/useAuth';
import { AD_ACTION_EVENT, adIsVisible, safeAdUrl, type AdPlacement } from '@/lib/ads';

export function AdSlot({ placement, onDismiss, className = '' }: { placement: AdPlacement; onDismiss?: () => void; className?: string }) {
  const { settings, loading } = useSiteSettings();
  const { profile } = useAuth();
  const { pathname } = useLocation();
  if (loading || profile?.role === 'admin' || settings.maintenance_mode === 'true'
    || !adIsVisible(settings, placement)
    || /^\/(admin|login|register|reset-password|auth|chat|contact|terms|privacy|onboarding|settings|suspended)(\/|$)/.test(pathname)) return null;
  return <aside aria-label="Advertisement" className={`my-4 flex flex-wrap items-start gap-3 rounded-lg border border-ink-100 bg-ink-50 px-4 py-3 ${className}`}>
    <div className="min-w-0 flex-1 break-words">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Advertisement · {settings.ads_sponsor}</p>
      <p className="mt-1 text-sm font-semibold text-ink-800">{settings.ads_title}</p>
      {settings.ads_body && <p className="mt-1 text-xs leading-5 text-ink-600">{settings.ads_body}</p>}
      <a href={safeAdUrl(settings.ads_url)!} target="_blank" rel="sponsored noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-700 underline dark:text-emerald-300">Visit sponsor <span className="sr-only">(opens in a new tab)</span></a>
    </div>
    {onDismiss && <button type="button" aria-label="Dismiss advertisement" onClick={onDismiss} className="min-h-11 rounded-md px-3 text-sm text-ink-500">Close</button>}
  </aside>;
}

let lastActionAd = 0;
export function ActionAd() {
  const { settings } = useSiteSettings();
  const [placement, setPlacement] = useState<'connection' | 'listing' | null>(null);
  useEffect(() => {
    const show = (event: Event) => {
      const next = (event as CustomEvent).detail;
      if (next !== 'connection' && next !== 'listing') return;
      try { lastActionAd = Math.max(lastActionAd, Number(sessionStorage.getItem('11drive-ad-last-shown')) || 0); } catch { /* In-memory limit if storage is blocked. */ }
      if (!adIsVisible(settings, next) || Date.now() - lastActionAd < 10 * 60 * 1000) return;
      lastActionAd = Date.now();
      try { sessionStorage.setItem('11drive-ad-last-shown', String(lastActionAd)); } catch { /* No tracking identifier or cookie is required. */ }
      setPlacement(next);
    };
    window.addEventListener(AD_ACTION_EVENT, show);
    return () => window.removeEventListener(AD_ACTION_EVENT, show);
  }, [settings]);
  return placement ? <div className="container-content"><AdSlot placement={placement} onDismiss={() => setPlacement(null)} /></div> : null;
}
