import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { DriverApprovalNotice } from '../../src/components/DriverApprovalNotice';
import { DocumentExpiry } from '../../src/components/DocumentExpiry';
import { EmptyState } from '../../src/components/EmptyState';
import { ReportRemovalAction } from '../../src/components/ReportRemovalAction';
import type { Profile } from '../../src/lib/types';
import '../../src/index.css';
import '../../src/styles/site-palette.css';

// Presentation only: real shared components, no account or network mutations.
const pending = { role: 'driver', platform_history_submitted: true, platform_history_approved: false } as Profile;
export function NeutralSurfacesFixture() {
  return <MemoryRouter><main className="mx-auto max-w-4xl space-y-5 p-4">
    <button className="btn-secondary" onClick={() => document.documentElement.classList.toggle('dark')}>Toggle test theme</button>
    <h1 className="text-xl font-bold">Neutral surfaces</h1>
    <DriverApprovalNotice profile={pending} />
    <div className="chat-outgoing ml-auto max-w-[85%] rounded-2xl p-4"><p className="text-xs text-white/80">You · 10:30</p><p>My sent message stays readable in both themes.</p></div>
    <EmptyState title="No conversations yet" description="Your conversations will appear here once you connect." action={<button className="btn-secondary">Browse members</button>} />
    <ReportRemovalAction onRemove={async () => true} />
    <section aria-label="Document urgency"><h2 className="font-semibold">Meaningful status colours remain</h2><DocumentExpiry expiresAt={new Date(Date.now() - 86_400_000).toISOString()} /><DocumentExpiry expiresAt={new Date(Date.now() + 5 * 86_400_000).toISOString()} /></section>
  </main></MemoryRouter>;
}
createRoot(document.getElementById('root')!).render(<NeutralSurfacesFixture />);
