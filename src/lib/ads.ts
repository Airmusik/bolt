export const AD_DEFAULTS = {
  ads_enabled: 'false',
  ads_provider: 'adsense',
  adsense_publisher_id: '',
  adsense_inline_slot: '',
  adsense_footer_slot: '',
  adsense_ready: 'false',
  ads_inline_enabled: 'false',
  ads_footer_enabled: 'false',
  ads_connection_enabled: 'false',
  ads_listing_enabled: 'false',
  ads_home_enabled: 'false',
  ads_browse_enabled: 'false',
  ads_detail_enabled: 'false',
  ads_dashboard_enabled: 'false',
  ads_sponsor: '',
  ads_title: '',
  ads_body: '',
  ads_url: '',
  ads_image_url: '',
  ads_cta: 'Visit sponsor',
  ads_video_enabled: 'false',
  ads_video_url: '',
  ads_video_poster: '',
  ads_video_sponsor: '',
  ads_video_title: '',
  ads_video_destination: '',
  ads_video_cta: 'Learn more',
} as const;
export type AdSettings = Record<keyof typeof AD_DEFAULTS, string>;
export const AD_PLACEMENTS = [
  { id: 'home', label: 'Homepage · below search', description: 'Between the main search area and featured cars.', network: false },
  { id: 'browse', label: 'Browse · above results', description: 'On the car and driver directories, below the filters.', network: false },
  { id: 'inline', label: 'Featured & browsing feed', description: 'After featured cars, or after the sixth search result when more results exist.', network: true },
  { id: 'detail', label: 'Car & member details', description: 'Below the main listing or public profile information.', network: false },
  { id: 'dashboard', label: 'Dashboard overview', description: 'Below account activity. Never inside a conversation.', network: false },
  { id: 'footer', label: 'Footer banner', description: 'Above the footer links on eligible pages.', network: true },
  { id: 'connection', label: 'After a connection request', description: 'A dismissible banner after a successful request; rate limited.', network: false },
  { id: 'listing', label: 'After saving a car', description: 'A dismissible banner after a successful save; rate limited.', network: false },
] as const;
export type AdPlacement = typeof AD_PLACEMENTS[number]['id'];
export function safeAdUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function adSettingsError(settings: AdSettings): string | null {
  if (!['adsense', 'direct'].includes(settings.ads_provider)) return 'Choose a supported ad provider.';
  for (const [value, label, kind] of [
    [settings.ads_image_url, 'Sponsor image', 'image'],
    [settings.ads_video_url, 'Video', 'video'],
    [settings.ads_video_poster, 'Video cover', 'image'],
  ] as const) {
    if (value && !safeAdMediaUrl(value, kind)) return `${label} must be a direct HTTPS ${kind === 'video' ? 'MP4 or WebM' : 'JPG, PNG or WebP'} file URL.`;
  }
  if (settings.ads_video_destination && !safeAdUrl(settings.ads_video_destination)) return 'Video destination must be a valid HTTPS URL without credentials.';
  if (settings.ads_video_sponsor.length > 60 || settings.ads_video_title.length > 80 || settings.ads_video_cta.length > 30 || settings.ads_cta.length > 30) return 'Ad text exceeds the allowed length.';
  if (settings.ads_enabled === 'true' && settings.ads_video_enabled === 'true' && videoAdError(settings)) return videoAdError(settings);
  if (settings.ads_provider === 'adsense') {
    if (settings.adsense_publisher_id && !/^ca-pub-\d{16}$/.test(settings.adsense_publisher_id)) return 'Enter a valid AdSense publisher ID: ca-pub- followed by 16 digits.';
    for (const slot of [settings.adsense_inline_slot, settings.adsense_footer_slot]) if (slot && !/^\d{10}$/.test(slot)) return 'Ad unit IDs must contain 10 digits.';
    if (settings.ads_enabled === 'true' && (settings.ads_video_enabled !== 'true' || settings.ads_inline_enabled === 'true' || settings.ads_footer_enabled === 'true')) {
      if (!settings.adsense_publisher_id || settings.adsense_ready !== 'true') return 'Complete Google approval, privacy and consent setup before enabling AdSense.';
      if (settings.ads_inline_enabled === 'true' && !settings.adsense_inline_slot) return 'Add the browsing ad unit ID.';
      if (settings.ads_footer_enabled === 'true' && !settings.adsense_footer_slot) return 'Add the footer ad unit ID.';
    }
    return null;
  }
  if (settings.ads_url && !safeAdUrl(settings.ads_url)) return 'Ad destination must be a valid HTTPS URL without credentials.';
  if (settings.ads_title.length > 80 || settings.ads_body.length > 180 || settings.ads_sponsor.length > 60) return 'Ad text exceeds the allowed length.';
  if (settings.ads_enabled === 'true' && (settings.ads_video_enabled !== 'true' || AD_PLACEMENTS.some(({ id }) => settings[`ads_${id}_enabled`] === 'true')) && (!settings.ads_sponsor.trim() || !settings.ads_title.trim() || !safeAdUrl(settings.ads_url))) return 'Add a sponsor name, headline and HTTPS destination before enabling banner ads.';
  return null;
}
export function adIsVisible(settings: AdSettings, placement: AdPlacement): boolean {
  if (settings.ads_provider === 'adsense' && !AD_PLACEMENTS.find(item => item.id === placement)?.network) return false;
  return settings.ads_enabled === 'true' && settings[`ads_${placement}_enabled`] === 'true'
    && !adSettingsError(settings);
}
export function safeAdMediaUrl(value: string, kind: 'image' | 'video'): string | null {
  const url = safeAdUrl(value);
  if (!url) return null;
  const extension = kind === 'video' ? /\.(mp4|webm)$/i : /\.(jpe?g|png|webp)$/i;
  return extension.test(new URL(url).pathname) ? url : null;
}
export function videoAdError(settings: AdSettings): string | null {
  return settings.ads_video_sponsor.trim() && settings.ads_video_title.trim()
    && safeAdMediaUrl(settings.ads_video_url, 'video') && safeAdUrl(settings.ads_video_destination)
    ? null : 'For the footer video, add a sponsor, headline, MP4/WebM file and HTTPS destination.';
}
export function videoAdIsVisible(settings: AdSettings): boolean {
  return settings.ads_enabled === 'true' && settings.ads_video_enabled === 'true' && !videoAdError(settings);
}
export function adPageAllowed(pathname: string, search = ''): boolean {
  // Exclude task flows, including chat tabs embedded in the dashboard.
  if (/^\/(admin|login|register|reset-password|auth|chat|contact|help|terms|privacy|onboarding|settings|suspended|notifications)(\/|$)/.test(pathname)) return false;
  if (/^\/vehicles\/(new|[^/]+\/edit)(\/|$)/.test(pathname)) return false;
  if (pathname === '/dashboard') return ['overview', 'cars', 'drivers'].includes(new URLSearchParams(search).get('tab') || 'overview');
  return true;
}

export function adMediaFileError(file: { name: string; type: string; size: number }, kind: 'image' | 'video'): string | null {
  const formats: Record<string, string> = kind === 'video' ? { mp4: 'video/mp4', webm: 'video/webm' } : { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const expected = formats[extension];
  if (!expected || (file.type && file.type !== expected)) return kind === 'video' ? 'Choose an MP4 or WebM video.' : 'Choose a JPG, PNG or WebP image.';
  const limit = kind === 'video' ? 8 : 3;
  if (!file.size || file.size > limit * 1024 * 1024) return `Choose a non-empty file no larger than ${limit} MB.`;
  return null;
}
export const AD_ACTION_EVENT = '11drive-successful-ad-action';
export function notifyAdAction(placement: 'connection' | 'listing') {
  window.dispatchEvent(new CustomEvent(AD_ACTION_EVENT, { detail: placement }));
}
