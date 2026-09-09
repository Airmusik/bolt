// Development-only visual fixture: not an app route or a production build entry.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminAdSettings } from '../../src/components/AdminAdSettings';
import { VideoAdCreative } from '../../src/components/FooterVideoAd';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '../../src/lib/siteSettings';
import { applySiteTheme } from '../../src/lib/siteTheme';
import '../../src/index.css';
import '../../src/styles/site-palette.css';
import '../../src/styles/admin.css';

applySiteTheme('cyan');
function Fixture() {
  const [settings, setSettings] = useState<SiteSettings>({ ...DEFAULT_SITE_SETTINGS, ads_provider: 'direct', ads_sponsor: 'Example sponsor', ads_title: 'Keep your next journey moving', ads_body: 'A sample banner for checking spacing and links. No live settings are changed.', ads_url: 'https://www.11drive.com/', ads_video_sponsor: 'Example sponsor', ads_video_title: 'A clear headline for a short sponsor video', ads_video_destination: 'https://www.11drive.com/' });
  const [view, setView] = useState(false);
  const [closed, setClosed] = useState(false);
  return <div className="container-content py-6"><div className="mb-4 flex flex-wrap gap-3"><button className="btn-secondary" onClick={() => document.documentElement.classList.toggle('dark')}>Toggle test theme</button><button className="btn-secondary" onClick={() => { setView(value => !value); setClosed(false); }}>Toggle footer playback test</button><span className="text-sm text-ink-500">Local fixture · no settings save</span></div>
    {view ? <><div style={{ minHeight: '70vh' }}>Scroll to the sample footer. Set a valid video URL in the editor first.</div><div className="flex justify-end">{!closed && <VideoAdCreative key={settings.ads_video_url} settings={settings} onDismiss={() => setClosed(true)} />}</div><div style={{ minHeight: '120vh', paddingTop: 40 }}>Content below the sample footer for pause-on-scroll testing.</div></> : <div className="admin-portal"><AdminAdSettings settings={settings} onChange={setSettings} onBusy={() => {}} /></div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
