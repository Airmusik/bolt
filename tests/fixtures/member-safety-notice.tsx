import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { MemberSafetyNotice } from '../../src/components/MemberSafetyNotice';
import { SiteSettingsProvider } from '../../src/lib/siteSettings';
import '../../src/index.css';
import '../../src/styles/site-palette.css';

// Real shared component at wide and narrow widths; no account or data mutations.
export function SafetyNoticeFixture() {
  return <SiteSettingsProvider><MemoryRouter><main className="mx-auto max-w-5xl space-y-4 p-4">
    <h1 className="text-xl">Shared safety notice</h1>
    <div><p>Desktop · light</p><MemberSafetyNotice /></div>
    <div className="dark rounded-lg bg-[#17191f] p-4"><p className="text-ink-600">Desktop · dark</p><MemberSafetyNotice /></div>
    <div className="flex flex-wrap items-start gap-6">
      <div style={{ width: 320 }}><p>320px panel · light</p><MemberSafetyNotice /></div>
      <div className="dark bg-[#17191f]" style={{ width: 320 }}><p className="text-ink-600">320px panel · dark</p><MemberSafetyNotice /></div>
    </div>
  </main></MemoryRouter></SiteSettingsProvider>;
}
createRoot(document.getElementById('root')!).render(<SafetyNoticeFixture />);
