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
    <p className="text-sm text-ink-500">Optional text ads, separate from paid listing promotions. All placements are off by default. No pop-ups, autoplay, tracking scripts or forced clicks. One sponsor creative is shared across enabled placements.</p>
    {switches.map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={settings[key] === 'true'} onChange={e => onChange({ ...settings, [key]: String(e.target.checked) })} />{label}</label>)}
    <label className="block text-sm">Sponsor name<input className="input mt-1" maxLength={60} value={settings.ads_sponsor} onChange={e => onChange({ ...settings, ads_sponsor: e.target.value })} /></label>
    <label className="block text-sm">Headline<input className="input mt-1" maxLength={80} value={settings.ads_title} onChange={e => onChange({ ...settings, ads_title: e.target.value })} /></label>
    <label className="block text-sm">Short description<textarea className="input mt-1" rows={2} maxLength={180} value={settings.ads_body} onChange={e => onChange({ ...settings, ads_body: e.target.value })} /></label>
    <label className="block text-sm">Sponsor destination<input type="url" className="input mt-1" placeholder="https://" value={settings.ads_url} onChange={e => onChange({ ...settings, ads_url: e.target.value })} /></label>
    <p className="text-xs leading-5 text-ink-500">Use Save settings below to apply changes. Action ads can be dismissed and appear at most once every 10 minutes per open app session. Ads are hidden on admin, sign-in, chat, support, legal and sensitive account pages. This does not connect an external ad network or collect advertising revenue automatically.</p>
  </section>;
}
