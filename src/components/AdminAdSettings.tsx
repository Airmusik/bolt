import { useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { LayoutGrid, Megaphone, MonitorPlay, Eye } from 'lucide-react';
import type { SiteSettings } from '@/lib/siteSettings';
import { AD_PLACEMENTS, resolveAdVideo, type AdSettings } from '@/lib/ads';
import { AdminAdMediaField } from './AdminAdMediaField';
import { SponsorCreative } from './SponsorCreative';
import { VideoAdCreative } from './FooterVideoAd';

type Section = 'placements' | 'creative' | 'video' | 'preview';
export function AdminAdSettings({ settings, onChange, onBusy }: { settings: SiteSettings; onChange: Dispatch<SetStateAction<SiteSettings>>; onBusy: (busy: boolean) => void }) {
  const [section, setSection] = useState<Section>('placements');
  const direct = settings.ads_provider === 'direct';
  const update = (key: keyof AdSettings, value: string) => onChange(current => ({ ...current, [key]: value }));
  const enabled = AD_PLACEMENTS.filter(item => (direct || item.network) && settings[`ads_${item.id}_enabled`] === 'true').length;
  const videoSource = resolveAdVideo(settings.ads_video_url, settings.ads_video_source_type);
  return <div className="space-y-4">
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="font-display text-xl font-bold">Advertisements</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-ink-500">Manage where ads appear, prepare sponsor content and preview before publishing. Paid member promotions stay separate.</p></div>
        <span className={settings.ads_enabled === 'true' ? 'badge-success' : 'badge-neutral'}>{settings.ads_enabled === 'true' ? 'Ads enabled in draft' : 'Ads paused in draft'}</span>
      </div>
      <div className="mt-4 grid gap-4 rounded-xl bg-ink-50 p-4 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.ads_enabled === 'true'} onChange={event => update('ads_enabled', String(event.target.checked))} className="h-5 w-5" />Enable advertisements</label>
        <label className="block text-sm font-medium">Banner provider<select className="input mt-1" value={settings.ads_provider} onChange={event => onChange({ ...settings, ads_provider: event.target.value, ads_enabled: 'false' })}><option value="direct">Direct sponsor · text / image</option><option value="adsense">Google AdSense · display units</option></select></label>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-500">{enabled} banner placement{enabled === 1 ? '' : 's'} selected · Footer video {settings.ads_video_enabled === 'true' ? 'selected' : 'off'}. Nothing changes publicly until you save. The master switch pauses banners and video together.</p>
    </section>
    <nav aria-label="Advertisement settings sections" className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 bg-ink-50 p-2 sm:grid-cols-4">
      {([{ id: 'placements', title: 'Placements', icon: LayoutGrid }, { id: 'creative', title: direct ? 'Sponsor content' : 'Google setup', icon: Megaphone }, { id: 'video', title: 'Footer video', icon: MonitorPlay }, { id: 'preview', title: 'Preview', icon: Eye }] as const).map(({ id, title, icon: Icon }) => <button key={id} type="button" aria-pressed={section === id} onClick={() => setSection(id)} className="admin-nav-button flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900"><Icon className="h-4 w-4 shrink-0" />{title}</button>)}
    </nav>
    <div hidden={section !== 'placements'}><Panel title="Choose your placements" description="Each switch controls a real location on the site. New placements start off so you can choose how many ads visitors see.">
      <div className="grid gap-3 md:grid-cols-2">{AD_PLACEMENTS.map(item => {
        const unavailable = !direct && !item.network;
        return <label key={item.id} className={`flex items-start gap-3 rounded-xl border p-4 ${!unavailable && settings[`ads_${item.id}_enabled`] === 'true' ? 'border-brand-400 bg-brand-50/50' : 'border-ink-100'}`}>
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={unavailable} checked={!unavailable && settings[`ads_${item.id}_enabled`] === 'true'} onChange={event => update(`ads_${item.id}_enabled`, String(event.target.checked))} />
          <span className="min-w-0"><span className="text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs leading-5 text-ink-500">{item.description}</span>{unavailable && <span className="mt-1 block text-xs font-medium text-ink-500">Direct sponsor only</span>}</span>
        </label>;
      })}</div>
      <p className="text-xs leading-5 text-ink-500">Ads stay away from admin screens, sign-in, uploads, chats, support, legal pages and notifications. AdSense runs only on public home and browsing pages. Start with a few placements to keep the site comfortable on mobile.</p>
    </Panel></div>
    <div hidden={section !== 'creative'}><Panel title={direct ? 'Banner creative' : 'Google AdSense setup'} description={direct ? 'One shared sponsor banner is used at all selected banner placements. The footer video has its own creative and destination.' : 'Keep existing approved manual display units. No automatic pop-ups or forced ad clicks.'}>
      {direct ? <>
        <div className="grid gap-4 sm:grid-cols-2"><TextField label="Sponsor name" value={settings.ads_sponsor} max={60} onChange={value => update('ads_sponsor', value)} /><TextField label="Headline" value={settings.ads_title} max={80} onChange={value => update('ads_title', value)} /></div>
        <label className="block text-sm font-medium">Short description<textarea className="input mt-1" rows={2} maxLength={180} value={settings.ads_body} onChange={event => update('ads_body', event.target.value)} /><span className="mt-1 block text-xs font-normal text-ink-500">Optional, up to 180 characters. Keep the offer clear and factual.</span></label>
        <div className="grid gap-4 sm:grid-cols-2"><TextField label="Sponsor destination" value={settings.ads_url} type="url" onChange={value => update('ads_url', value)} help="The HTTPS website or source page opened when the ad link is clicked." /><TextField label="Link button label" value={settings.ads_cta} max={30} onChange={value => update('ads_cta', value)} help="For example: Learn more, View offer or Visit website." /></div>
        <AdminAdMediaField label="Banner image" kind="image" value={settings.ads_image_url} onChange={value => update('ads_image_url', value)} onBusy={onBusy} />
      </> : <>
        <TextField label="Publisher ID" value={settings.adsense_publisher_id} onChange={value => onChange({ ...settings, adsense_publisher_id: value.trim(), adsense_ready: 'false', ads_enabled: 'false' })} help="ca-pub- followed by 16 digits." />
        <div className="grid gap-4 sm:grid-cols-2"><TextField label="Browsing ad unit ID" value={settings.adsense_inline_slot} max={10} onChange={value => update('adsense_inline_slot', value.trim())} /><TextField label="Footer ad unit ID" value={settings.adsense_footer_slot} max={10} onChange={value => update('adsense_footer_slot', value.trim())} /></div>
        <p className="text-xs leading-5 text-ink-500">Complete Google's site approval, privacy, consent and ads.txt setup first. Keep Auto ads, anchor ads and vignette ads off to preserve manual placements. Google controls ad availability and earnings; entering IDs does not guarantee either.</p>
        {/^ca-pub-\d{16}$/.test(settings.adsense_publisher_id) && <div className="rounded-xl bg-ink-50 p-3 text-xs"><p>Publish this entry at /ads.txt:</p><code className="mt-2 block break-all">google.com, {settings.adsense_publisher_id.replace('ca-', '')}, DIRECT, f08c47fec0942fa0</code></div>}
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={settings.adsense_ready === 'true'} onChange={event => onChange({ ...settings, adsense_ready: String(event.target.checked), ads_enabled: 'false' })} />Google has approved the site and I have completed consent, privacy and ads.txt setup. This does not configure consent automatically.</label>
      </>}
    </Panel></div>
    <div hidden={section !== 'video'}><Panel title="Muted footer video" description="A separate sponsor video, aligned to the right near the footer on desktop and stacked on mobile. It stays in the page—not over chats or navigation.">
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.ads_video_enabled === 'true'} onChange={event => update('ads_video_enabled', String(event.target.checked))} className="h-5 w-5" />Show footer video advertisement</label>
      <p className="text-xs leading-5 text-ink-500">Works with either banner provider. Supported videos start muted when visible and pause off-screen. YouTube/Vimeo retain their own controls; visitors can close the ad or open its source. Reduced-motion/data-saving users can choose to load/play. Provider privacy or embedding restrictions may prevent playback; the source link remains available.</p>
      <div className="grid gap-4 sm:grid-cols-2"><TextField label="Video sponsor name" value={settings.ads_video_sponsor} max={60} onChange={value => update('ads_video_sponsor', value)} /><TextField label="Video headline" value={settings.ads_video_title} max={80} onChange={value => update('ads_video_title', value)} /></div>
      <AdminAdMediaField label="Video link or file" kind="video" value={settings.ads_video_url} onChange={value => update('ads_video_url', value)} onBusy={onBusy} />
      <label className="block text-sm font-medium">Video link handling<select className="input mt-1" value={settings.ads_video_source_type} onChange={event => update('ads_video_source_type', event.target.value)}><option value="auto">Automatic · YouTube, Vimeo, video files or source link</option><option value="file">Direct video file · including URLs without a file extension</option></select><span className="mt-1 block text-xs font-normal leading-5 text-ink-500">Use Direct video file only for a URL that returns video—not a social-media webpage. The browser must support its format.</span></label>
      {videoSource && <p role="status" className="rounded-xl bg-ink-50 p-3 text-sm">{videoSource.kind === 'youtube' ? 'YouTube player detected (including Shorts).' : videoSource.kind === 'vimeo' ? 'Vimeo player detected.' : videoSource.kind === 'file' ? 'Direct video player selected.' : 'Source-link card: this website is not supported for embedded playback.'} Check the Preview section before saving.</p>}
      <AdminAdMediaField label="Video cover image" kind="image" value={settings.ads_video_poster} onChange={value => update('ads_video_poster', value)} onBusy={onBusy} />
      <div className="grid gap-4 sm:grid-cols-2"><TextField label="Video destination (optional)" value={settings.ads_video_destination} type="url" onChange={value => update('ads_video_destination', value)} help="Leave blank to open the original video/source. Enter another HTTPS page only if the ad should go there instead. The title and link button use this destination." /><TextField label="Video link button label" value={settings.ads_video_cta} max={30} onChange={value => update('ads_video_cta', value)} /></div>
    </Panel></div>
    {section === 'preview' && <Panel title="Preview before publishing" description="This is your unsaved draft. Admin pages never display live ads. Sponsor links open the destination in a new tab; previews do not load Google ads.">
      {direct ? <SponsorCreative settings={settings} /> : <div className="rounded-xl border border-dashed border-ink-300 p-8 text-center text-sm text-ink-500">Google display unit · sizing and content are provided by Google on eligible public pages.</div>}
      <h4 className="text-sm font-semibold">Footer video · press Play or Load video to test</h4><VideoAdCreative key={`${settings.ads_video_source_type}:${settings.ads_video_url}`} settings={settings} preview />
    </Panel>}
  </div>;
}

function Panel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="card space-y-4 p-4 sm:p-5"><div><h3 className="font-display text-lg font-bold">{title}</h3><p className="mt-1 text-sm leading-6 text-ink-500">{description}</p></div>{children}</section>;
}
function TextField({ label, value, onChange, max, help, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; max?: number; help?: string; type?: string }) {
  return <label className="block text-sm font-medium">{label}<input type={type} className="input mt-1" value={value} maxLength={max} onChange={event => onChange(event.target.value)} />{help && <span className="mt-1 block text-xs font-normal leading-5 text-ink-500">{help}</span>}</label>;
}
