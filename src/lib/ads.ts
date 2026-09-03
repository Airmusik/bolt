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
  ads_sponsor: '',
  ads_title: '',
  ads_body: '',
  ads_url: '',
} as const;
export type AdSettings = Record<keyof typeof AD_DEFAULTS, string>;
export type AdPlacement = 'inline' | 'footer' | 'connection' | 'listing';
export function safeAdUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function adSettingsError(settings: AdSettings): string | null {
  if (settings.ads_provider === 'adsense') {
    if (settings.adsense_publisher_id && !/^ca-pub-\d{16}$/.test(settings.adsense_publisher_id)) return 'Enter a valid AdSense publisher ID: ca-pub- followed by 16 digits.';
    for (const slot of [settings.adsense_inline_slot, settings.adsense_footer_slot]) if (slot && !/^\d{10}$/.test(slot)) return 'Ad unit IDs must contain 10 digits.';
    if (settings.ads_enabled === 'true') {
      if (!settings.adsense_publisher_id || settings.adsense_ready !== 'true') return 'Complete Google approval, privacy and consent setup before enabling AdSense.';
      if (settings.ads_inline_enabled === 'true' && !settings.adsense_inline_slot) return 'Add the browsing ad unit ID.';
      if (settings.ads_footer_enabled === 'true' && !settings.adsense_footer_slot) return 'Add the footer ad unit ID.';
    }
    return null;
  }
  if (settings.ads_url && !safeAdUrl(settings.ads_url)) return 'Ad destination must be a valid HTTPS URL without credentials.';
  if (settings.ads_title.length > 80 || settings.ads_body.length > 180 || settings.ads_sponsor.length > 60) return 'Ad text exceeds the allowed length.';
  if (settings.ads_enabled === 'true' && (!settings.ads_sponsor.trim() || !settings.ads_title.trim() || !safeAdUrl(settings.ads_url))) return 'Add a sponsor name, headline and HTTPS destination before enabling ads.';
  return null;
}
export function adIsVisible(settings: AdSettings, placement: AdPlacement): boolean {
  if (settings.ads_provider === 'adsense' && (placement === 'connection' || placement === 'listing')) return false;
  return settings.ads_enabled === 'true' && settings[`ads_${placement}_enabled`] === 'true'
    && !adSettingsError(settings);
}
export const AD_ACTION_EVENT = '11drive-successful-ad-action';
export function notifyAdAction(placement: 'connection' | 'listing') {
  window.dispatchEvent(new CustomEvent(AD_ACTION_EVENT, { detail: placement }));
}
