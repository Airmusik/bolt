import { useEffect } from 'react';

export function LaunchIntro({ siteName, onComplete }: { siteName: string; onComplete: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, 4500);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  const driveAt = siteName.toLowerCase().indexOf('drive');
  const prefix = driveAt >= 0 ? siteName.slice(0, driveAt) : siteName;
  const suffix = driveAt >= 0 ? siteName.slice(driveAt) : '';

  return (
    <div className="launch-intro fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-white dark:bg-[#0b0b0d]" role="status" aria-label={`Opening ${siteName}`}>
      <div className="launch-wordmark whitespace-nowrap font-display text-[clamp(3.5rem,16vw,10rem)] font-extrabold tracking-[-0.07em] text-ink-950">
        <span>{prefix}</span><span className="text-brand-600">{suffix}</span>
      </div>
    </div>
  );
}
