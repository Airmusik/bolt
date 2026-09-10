// Local-only interaction checks. No authentication or backend calls.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft } from 'lucide-react';
import { Modal } from '../../src/components/Modal';
import { applySiteTheme } from '../../src/lib/siteTheme';
import '../../src/index.css';
import '../../src/styles/site-palette.css';
import '../../src/styles/admin.css';

applySiteTheme('cyan');

export function Fixture() {
  const [dark, setDark] = useState(false);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [clicks, setClicks] = useState(0);
  return <main className="container-content max-w-3xl space-y-5 py-6">
    <h1 className="text-2xl font-bold">Button contrast checks</h1>
    <p>Local preview only. Buttons do not change any accounts.</p>
    <button type="button" className="btn-secondary" onClick={() => {
      document.documentElement.classList.toggle('dark', !dark);
      setDark(!dark);
    }}>Use {dark ? 'light' : 'dark'} mode</button>
    <section className="card space-y-4 p-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => setClicks(clicks + 1)}>Primary action</button>
        <button type="button" className="btn-secondary" onClick={() => setClicks(clicks + 1)}>Secondary action</button>
        <button type="button" className="btn-ghost" onClick={() => setClicks(clicks + 1)}>Text action</button>
      </div>
      <p role="status">Actions clicked: {clicks}</p>
      <div className="flex flex-wrap gap-2" aria-label="Listing filters">
        {['all', 'live', 'pending'].map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className="admin-member-filter rounded-full border px-3 py-1.5 text-xs font-medium capitalize">{value} listings</button>)}
      </div>
      <p>Showing {filter} listings</p>
      <button type="button" aria-label="Back" onClick={() => setClicks(clicks + 1)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-600 hover:bg-ink-100 active:bg-ink-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-500"><ArrowLeft className="h-5 w-5"/></button>
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Open popup</button>
    </section>
    {open && <Modal title="Button check" onClose={() => setOpen(false)}><p className="mb-4">The page behind this popup should be dimmed, not whitened.</p><div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="btn-primary" onClick={() => setOpen(false)}>Done</button></div></Modal>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<Fixture/>);
