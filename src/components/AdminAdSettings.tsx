import type { SiteSettings } from '@/lib/siteSettings';

export function AdminAdSettings({ settings, onChange }: { settings: SiteSettings; onChange: (next: SiteSettings) => void }) {
  const switches = [
    ['ads_enabled', 'Enable advertisements (master switch)'],
    ['ads_inline_enabled', 'Browsing pages — small in-page ad'],
    ['ads_footer_enabled', 'Footer ad'],
    ['ads_connection_enabled', 'After a connection request is successfully sent'],
    ['ads_listing_enabled', 'After a vehicle listing is successfully saved'],
  ] as const;
  return <section className="card space-y-4 p-5">
    <h3 className="font-display text-lg font-bold">Advertisements</h3>
    <p className="text-sm text-ink-500">Separate from paid listing promotions. Ads stay off until configured. Choose Google AdSense for network ads, or Direct sponsor for your own text ads.</p>
    <label className="block text-sm">Ad provider<select className="input mt-1" value={settings.ads_provider} onChange={e => onChange({ ...settings, ads_provider: e.target.value, ads_enabled: 'false', adsense_ready: 'false' })}><option value="direct">Direct sponsor</option><option value="adsense">Google AdSense</option></select></label>
    {switches.filter(([key]) => settings.ads_provider !== 'adsense' || !['ads_connection_enabled','ads_listing_enabled'].includes(key)).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={settings[key] === 'true'} onChange={e => onChange({ ...settings, [key]: String(e.target.checked) })} />{label}</label>)}
    {settings.ads_provider === 'adsense' ? <div className="space-y-4">
      <label className="block text-sm">Publisher ID<input className="input mt-1" placeholder="ca-pub- followed by 16 digits" value={settings.adsense_publisher_id} onChange={e => onChange({ ...settings, adsense_publisher_id: e.target.value.trim(), adsense_ready: 'false', ads_enabled: 'false' })} /></label>
      <label className="block text-sm">Browsing display ad unit ID<input className="input mt-1" inputMode="numeric" maxLength={10} value={settings.adsense_inline_slot} onChange={e => onChange({ ...settings, adsense_inline_slot: e.target.value.trim() })} /></label>
      <label className="block text-sm">Footer display ad unit ID<input className="input mt-1" inputMode="numeric" maxLength={10} value={settings.adsense_footer_slot} onChange={e => onChange({ ...settings, adsense_footer_slot: e.target.value.trim() })} /></label>
      <p className="text-xs leading-5 text-ink-500">First create your AdSense account, add 11drive.com and complete Google's site verification/approval. Set up Privacy & messaging (including a certified consent platform where required), update the privacy policy, and publish your ads.txt entry. Keep Auto ads, anchor ads and vignette ads OFF in Google to preserve these manual placements. Only public home and browse pages serve Google units; Connect and Save never trigger them.</p>
      {/\bca-pub-\d{16}$/.test(settings.adsense_publisher_id) && <div className="rounded-lg bg-ink-50 p-3"><p className="text-xs">Publish this at /ads.txt before enabling:</p><code className="mt-2 block break-all text-xs">google.com, {settings.adsense_publisher_id.replace('ca-', '')}, DIRECT, f08c47fec0942fa0</code></div>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={settings.adsense_ready === 'true'} onChange={e => onChange({ ...settings, adsense_ready: String(e.target.checked), ads_enabled: 'false' })} />Google has approved the site and I have completed consent, privacy and ads.txt setup. This checkbox does not configure consent automatically.</label>
    </div> : <>
    <label className="block text-sm">Sponsor name<input className="input mt-1" maxLength={60} value={settings.ads_sponsor} onChange={e => onChange({ ...settings, ads_sponsor: e.target.value })} /></label>
    <label className="block text-sm">Headline<input className="input mt-1" maxLength={80} value={settings.ads_title} onChange={e => onChange({ ...settings, ads_title: e.target.value })} /></label>
    <label className="block text-sm">Short description<textarea className="input mt-1" rows={2} maxLength={180} value={settings.ads_body} onChange={e => onChange({ ...settings, ads_body: e.target.value })} /></label>
    <label className="block text-sm">Sponsor destination<input type="url" className="input mt-1" placeholder="https://" value={settings.ads_url} onChange={e => onChange({ ...settings, ads_url: e.target.value })} /></label>
    </>}
    <p className="text-xs leading-5 text-ink-500">Use Save settings below. Turning ads off removes the placements. If Google code has already loaded in a visitor's tab, a reload is needed to fully unload it. Approval and ad availability are controlled by Google; adding IDs does not guarantee ads or earnings.</p>
  </section>;
}
