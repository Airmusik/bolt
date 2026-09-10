// Local component checks only. These callbacks never send requests or payments.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PromotionDraftActions } from '../../src/components/PromotionDraftActions';
import { PromotionRequestCard } from '../../src/components/PromotionRequestCard';
import { VehicleCard } from '../../src/components/VehicleCard';
import { VerifiedBadge } from '../../src/components/VerifiedBadge';
import { AvailabilityBadge } from '../../src/components/AvailabilityBadge';
import { applySiteTheme } from '../../src/lib/siteTheme';
import type { PromotionRequest } from '../../src/lib/promotions';
import type { VehicleWithRelations } from '../../src/lib/types';
import '../../src/index.css';
import '../../src/styles/site-palette.css';
import '../../src/styles/admin.css';

const sample: PromotionRequest = { id: 'local-preview', user_id: 'sample', kind: 'listing', vehicle_id: 'sample-car', status: 'awaiting_payment', amount: 500, duration_days: 7, payment_method: 'Test method', payment_instructions: 'TEST ONLY. Do not pay. This preview does not contact the backend.', terms: 'Test terms only.', payment_reference: null, admin_note: null, starts_at: null, expires_at: null, created_at: '2026-09-09T12:00:00Z', vehicle: { make: 'Toyota', model: 'Axio' } };
const vehicle = { id: 'sample-car', owner_id: 'sample', make: 'Toyota', model: 'Axio', year: 2020, transmission: 'automatic', fuel_type: 'petrol', location: 'Ongata Rongai', weekly_target: 10500, deposit: 15000, insurance_type: 'comprehensive', insurance_expiry: '2027-09-09', registered_platforms: ['uber', 'bolt'], status: 'active', approval_status: 'approved', availability: 'available', featured: true, created_at: '2026-09-09T12:00:00Z', photos: [], issues: [] } as VehicleWithRelations;
applySiteTheme('cyan');

function Fixture() {
  const [draft, setDraft] = useState(true);
  const [request, setRequest] = useState<PromotionRequest | null>(null);
  const [created, setCreated] = useState(0);
  const [actionCount, setActionCount] = useState(0);
  return <BrowserRouter><main className="mx-auto max-w-4xl space-y-6 p-4">
    <h1 className="text-xl font-bold">Local promotion and status test</h1>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-secondary" onClick={() => document.documentElement.classList.toggle('dark')}>Toggle theme</button><button type="button" className="btn-secondary" onClick={() => { setDraft(true); setRequest(null); setCreated(0); setActionCount(0); }}>Reset test</button></div>
    <p role="status">Requests created: {created}. Actions sent: {actionCount}.</p>
    {draft ? <section className="card p-4"><h2 className="font-semibold">Choose your promotion</h2><PromotionDraftActions busy={false} existing={false} onContinue={() => { setCreated(v => v + 1); setRequest(sample); setDraft(false); }} onCancel={() => setDraft(false)} /></section> : !request && <p role="status">Back to dashboard. Nothing submitted.</p>}
    {request && <PromotionRequestCard request={request} onAction={async (_, reference) => { setActionCount(v => v + 1); setRequest({ ...request, status: reference === null ? 'cancelled' : 'pending', payment_reference: reference }); }} />}
    <section aria-label="Status label examples" className="card space-y-4 p-4"><h2 className="font-semibold">Driver status</h2><div className="status-list"><VerifiedBadge verified showLabel/><AvailabilityBadge availability="available"/><span className="badge-accent">Promoted</span></div><div className="status-list"><VerifiedBadge verified={false} showLabel/><AvailabilityBadge availability="busy"/></div><div className="status-list"><span className="badge-warning">Pending approval</span><span className="badge-danger">Changes required</span><span className="badge-neutral">Not live</span></div></section>
    <section aria-label="Listing example" className="max-w-sm"><VehicleCard vehicle={vehicle} showOwner={false} showApprovalStatus /></section>
  </main></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
