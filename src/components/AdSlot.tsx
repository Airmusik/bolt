import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSiteSettings } from '@/lib/siteSettings';
import { useAuth } from '@/lib/useAuth';
import { AdSenseUnit } from './AdSenseUnit';
import { AD_ACTION_EVENT, adIsVisible, adPageAllowed, type AdPlacement } from '@/lib/ads';
import { SponsorCreative } from './SponsorCreative';

export function AdSlot({ placement, onDismiss, className = '' }: { placement: AdPlacement; onDismiss?: () => void; className?: string }) {
  const { settings, loading } = useSiteSettings();
  const { profile } = useAuth();
  const { pathname, search } = useLocation();
  if (loading || profile?.role === 'admin' || settings.maintenance_mode === 'true'
    || !adIsVisible(settings, placement)
    || !adPageAllowed(pathname, search)) return null;
  if (settings.ads_provider === 'adsense') {
    // Keep Google display ads on public content pages, away from account tasks.
    if (!['/', '/browse-cars', '/browse-drivers'].includes(pathname)) return null;
    const slot = placement === 'inline' ? settings.adsense_inline_slot : settings.adsense_footer_slot;
    return <AdSenseUnit key={`${settings.adsense_publisher_id}:${slot}`} publisher={settings.adsense_publisher_id} slot={slot} className={className} />;
  }
  return <SponsorCreative settings={settings} onDismiss={onDismiss} className={className} />;
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
