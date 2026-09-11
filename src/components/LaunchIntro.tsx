import { useEffect } from 'react';
import { SiteWordmark } from './SiteWordmark';

type LaunchIntroProps = {
  siteName: string;
  nameColours?: string;
  backgroundEnabled: boolean;
  backgroundType: string;
  backgroundUrl: string;
  backgroundPosition: string;
  overlayOpacity: number;
  allowVideo: boolean;
  onComplete: () => void;
};

export function LaunchIntro({ siteName, nameColours, backgroundEnabled, backgroundType, backgroundUrl, backgroundPosition, overlayOpacity, allowVideo, onComplete }: LaunchIntroProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 5400);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  const showBackground = backgroundEnabled && Boolean(backgroundUrl);

  return (
    <div className="launch-intro fixed inset-0 z-[100] isolate flex items-center justify-center overflow-hidden bg-white dark:bg-[#0b0b0d]" role="status" aria-label={`Opening ${siteName}`}>
      {showBackground && <>
        <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden bg-ink-900" aria-hidden="true">
          {backgroundType === 'video' && allowVideo
            ? <video src={backgroundUrl} autoPlay muted loop playsInline preload="metadata" className="h-full w-full object-cover" style={{ objectPosition: backgroundPosition }} />
            : backgroundType === 'image'
              ? <img src={backgroundUrl} alt="" loading="eager" decoding="async" className="h-full w-full object-cover" style={{ objectPosition: backgroundPosition }} />
              : null}
        </div>
        <div className="pointer-events-none absolute inset-0 -z-10 bg-white dark:bg-[#0b0b0d]" style={{ opacity: overlayOpacity }} aria-hidden="true" />
      </>}
      <div className="launch-content flex w-full flex-col items-center px-6">
        <div className="launch-wordmark max-w-full rounded-3xl bg-white/45 p-2 text-ink-950 backdrop-blur-[2px] dark:bg-black/25">
          <SiteWordmark decorative name={siteName} colours={nameColours} className="h-auto w-[min(82vw,44rem)]" />
        </div>
        <p className="launch-tagline mt-5 font-display text-sm font-semibold uppercase tracking-[0.32em] text-ink-700 dark:text-white/80 sm:text-base">
          True Connections
        </p>
        <div className="launch-loading-track mt-5 h-1 w-28 overflow-hidden rounded-full bg-ink-200/80 dark:bg-white/20" aria-hidden="true">
          <span className="launch-loading-line block h-full origin-left rounded-full bg-orange-500" />
        </div>
      </div>
    </div>
  );
}
