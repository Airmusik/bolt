import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { safeAdMediaUrl, safeAdUrl, type AdSettings } from '@/lib/ads';

export function SponsorCreative({ settings, onDismiss, className = '' }: { settings: AdSettings; onDismiss?: () => void; className?: string }) {
  const [failedImage, setFailedImage] = useState('');
  const image = safeAdMediaUrl(settings.ads_image_url, 'image');
  const destination = safeAdUrl(settings.ads_url);
  return <aside aria-label="Advertisement" className={`my-4 overflow-hidden rounded-2xl border border-ink-200 bg-white text-ink-900 dark:border-white/15 dark:bg-[#24272e] ${className}`}>
    <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-2 dark:border-white/10">
      <p className="break-words text-[10px] font-semibold uppercase tracking-wider text-ink-500">Advertisement · {settings.ads_sponsor || 'Sponsor name'}</p>
      {onDismiss && <button type="button" aria-label="Dismiss advertisement" onClick={onDismiss} className="min-h-11 px-2 text-xs text-ink-600">Close</button>}
    </div>
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      {image && failedImage !== image && <img src={image} alt={settings.ads_title || 'Sponsor advertisement'} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedImage(image)} className="max-h-48 w-full rounded-xl object-contain sm:w-36" />}
      <div className="min-w-0 flex-1 break-words">
        <p className="font-display text-base font-bold">{settings.ads_title || 'Your sponsor headline'}</p>
        {settings.ads_body && <p className="mt-1 text-sm leading-6 text-ink-600">{settings.ads_body}</p>}
      </div>
      {destination ? <a href={destination} target="_blank" rel="sponsored noopener noreferrer" className="btn-secondary shrink-0 justify-center text-sm">{settings.ads_cta.trim() || 'Visit sponsor'}<ExternalLink className="h-4 w-4" /><span className="sr-only">(opens in a new tab)</span></a> : <span className="text-xs text-ink-500">Add a destination to enable the link.</span>}
    </div>
  </aside>;
}
