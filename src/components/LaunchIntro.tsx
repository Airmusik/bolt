import { useEffect } from 'react';

type LaunchIntroProps = {
  siteName: string;
  backgroundEnabled: boolean;
  backgroundType: string;
  backgroundUrl: string;
  backgroundPosition: string;
  overlayOpacity: number;
  allowVideo: boolean;
  onComplete: () => void;
};

export function LaunchIntro({ siteName, backgroundEnabled, backgroundType, backgroundUrl, backgroundPosition, overlayOpacity, allowVideo, onComplete }: LaunchIntroProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 4500);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  const driveAt = siteName.toLowerCase().indexOf('drive');
  const prefix = driveAt >= 0 ? siteName.slice(0, driveAt) : siteName;
  const suffix = driveAt >= 0 ? siteName.slice(driveAt) : '';
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
      <div className="launch-wordmark whitespace-nowrap rounded-3xl bg-white/45 px-[0.2em] pb-[0.08em] font-display text-[clamp(3.5rem,16vw,10rem)] font-extrabold tracking-[-0.07em] text-ink-950 backdrop-blur-[2px] dark:bg-black/25">
        <span>{prefix}</span><span className="text-brand-600">{suffix}</span>
      </div>
    </div>
  );
}
