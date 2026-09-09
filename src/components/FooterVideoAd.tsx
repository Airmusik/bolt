import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ExternalLink, Pause, Play, VolumeX, X } from 'lucide-react';
import { useSiteSettings } from '@/lib/siteSettings';
import { useAuth } from '@/lib/useAuth';
import { adPageAllowed, safeAdMediaUrl, resolveAdVideo, videoAdDestination, videoAdIsVisible, type AdSettings } from '@/lib/ads';
import { ExternalAdVideo } from './ExternalAdVideo';

export function FooterVideoAd() {
  const { settings, loading } = useSiteSettings();
  const { profile } = useAuth();
  const { pathname, search } = useLocation();
  const [dismissed, setDismissed] = useState(false);
  if (loading || dismissed || profile?.role === 'admin' || settings.maintenance_mode === 'true'
    || !adPageAllowed(pathname, search) || !videoAdIsVisible(settings)) return null;
  return <div className="mb-6 flex justify-end"><VideoAdCreative key={`${settings.ads_video_source_type}:${settings.ads_video_url}`} settings={settings} onDismiss={() => setDismissed(true)} /></div>;
}

export function VideoAdCreative({ settings, onDismiss, preview = false }: { settings: AdSettings; onDismiss?: () => void; preview?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [playError, setPlayError] = useState('');
  const manuallyPaused = useRef(false);
  const source = resolveAdVideo(settings.ads_video_url, settings.ads_video_source_type);
  const src = source?.kind === 'file' ? source.url : null;
  const embedded = source?.kind === 'youtube' || source?.kind === 'vimeo';
  const destination = videoAdDestination(settings);

  useEffect(() => {
    const element = video.current;
    if (!element || !src || failed) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    let visible = false;
    let active = true;
    const sync = () => {
      const autoplay = !preview && !motion.matches && !connection?.saveData && !manuallyPaused.current;
      if (!visible || document.hidden || !autoplay) { element.pause(); return; }
      element.muted = true;
      void element.play().then(() => { if (!active || !visible || document.hidden || manuallyPaused.current) element.pause(); }).catch(() => { /* Native Play remains available when autoplay is blocked. */ });
    };
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); sync(); }, { threshold: 0.25 });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    connection?.addEventListener('change', sync);
    return () => { active = false; observer.disconnect(); element.pause(); document.removeEventListener('visibilitychange', sync); motion.removeEventListener('change', sync); connection?.removeEventListener('change', sync); };
  }, [src, preview, failed]);

  const togglePlay = async () => {
    const element = video.current;
    if (!element) return;
    setPlayError('');
    if (!element.paused) { manuallyPaused.current = true; element.pause(); return; }
    manuallyPaused.current = false;
    element.muted = true;
    try { await element.play(); } catch { setPlayError('This video could not play. You can still visit the sponsor.'); }
  };

  return <aside aria-label="Video advertisement" className="w-full max-w-sm overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm dark:border-white/15 dark:bg-[#24272e]">
    <div className="flex min-h-11 items-center justify-between gap-2 px-3">
      <span className="min-w-0 break-words text-[10px] font-semibold uppercase tracking-wide text-ink-500">Advertisement · {settings.ads_video_sponsor || 'Sponsor name'}</span>
      {onDismiss && <button type="button" aria-label="Close video advertisement" onClick={onDismiss} className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-500"><X className="h-4 w-4" /></button>}
    </div>
    {embedded ? <ExternalAdVideo key={`${source.kind}:${source.url}`} source={source} title={settings.ads_video_title} preview={preview} /> : source?.kind === 'link' ? <div className="bg-ink-50 p-4">
      {safeAdMediaUrl(settings.ads_video_poster, 'image') && <img src={settings.ads_video_poster} alt="Sponsor cover" loading="lazy" className="mb-3 max-h-48 w-full rounded-lg object-contain" />}
      <p className="text-sm text-ink-600">This source cannot play inside the site. Open the link below to watch it on the original website.</p>
    </div> : <div className="relative aspect-video bg-black">
      {src && !failed ? <video ref={video} src={src} poster={safeAdMediaUrl(settings.ads_video_poster, 'image') || undefined} muted playsInline loop preload="none" disablePictureInPicture aria-label={settings.ads_video_title || 'Sponsor video'} onPlay={() => { setPlaying(true); setPlayError(''); }} onPause={() => setPlaying(false)} onLoadedData={() => setReady(true)} onError={() => { setFailed(true); setPlaying(false); }} className="h-full w-full object-contain" /> : <p className="flex h-full items-center justify-center px-6 text-center text-sm text-white">{failed ? 'Video unavailable. The sponsor link is still available below.' : 'Add a video to see the preview.'}</p>}
      {src && !failed && !playing && !ready && <span className="pointer-events-none absolute inset-0 flex items-center justify-center"><Play className="h-10 w-10 text-white" /></span>}
    </div>}
    <div className="space-y-2 p-3">
      {!embedded && source?.kind !== 'link' && <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-ink-500"><VolumeX className="h-4 w-4" />Muted video</span>
        {src && !failed && <button type="button" onClick={() => void togglePlay()} className="btn-ghost min-h-11 px-3 text-xs" aria-label={playing ? 'Pause advertisement video' : 'Play advertisement video'}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Pause' : 'Play'}</button>}
      </div>}
      <p className="break-words text-sm font-semibold text-ink-900">{destination ? <a href={destination} target="_blank" rel="sponsored noopener noreferrer" className="hover:underline">{settings.ads_video_title || 'Your video headline'}<span className="sr-only"> (opens source in a new tab)</span></a> : settings.ads_video_title || 'Your video headline'}</p>
      {playError && <p role="status" className="text-xs text-ink-600">{playError}</p>}
      {destination && <a href={destination} target="_blank" rel="sponsored noopener noreferrer" className="btn-secondary w-full justify-center text-sm">{settings.ads_video_cta.trim() || 'Learn more'}<ExternalLink className="h-4 w-4" /><span className="sr-only">(opens in a new tab)</span></a>}
      {embedded && <p className="text-[10px] leading-4 text-ink-500">Video hosted by {source.kind === 'youtube' ? 'YouTube' : 'Vimeo'}. Loading its player connects to that provider.</p>}
    </div>
  </aside>;
}
