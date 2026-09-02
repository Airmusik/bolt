import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { promotionError, promotionStatus, promotionTitle, type PromotionRequest, type PromotionSettings } from '@/lib/promotions';
import { useToast } from './useToast';
import { Modal } from './Modal';

export function AdminPromotions() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<PromotionSettings | null>(null);
  const [draft, setDraft] = useState({ listing_price: '', profile_price: '', duration_days: '' });
  const [requests, setRequests] = useState<PromotionRequest[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<{ request: PromotionRequest; action: 'approve' | 'reject' | 'cancel' } | null>(null);
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const loadRequests = useCallback(async () => {
    const { data, error: e } = await supabase.from('promotion_requests').select('*, member:profiles!promotion_requests_user_id_fkey(full_name,role), vehicle:vehicles(make,model)').order('created_at', { ascending: false });
    if (e) throw e;
    setRequests(data || []);
  }, []);
  const load = useCallback(async () => {
    try {
      const { data, error: e } = await supabase.from('promotion_settings').select('*').single();
      if (e) throw e;
      setSettings(data); setDraft({ listing_price: String(data.listing_price), profile_price: String(data.profile_price), duration_days: String(data.duration_days) });
      await loadRequests(); setError('');
    } catch (e) { setError(promotionError(e)); }
  }, [loadRequests]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (!settings) return;
    const listing = Number(draft.listing_price), profile = Number(draft.profile_price), days = Number(draft.duration_days);
    if (!draft.listing_price.trim() || !draft.profile_price.trim() || !Number.isFinite(listing) || !Number.isFinite(profile) || listing < 0 || profile < 0 || !Number.isInteger(days) || days < 1 || days > 365) { toast('Enter valid non-negative prices and a duration between 1 and 365 days.', 'error'); return; }
    if (settings.enabled && (listing <= 0 || profile <= 0 || !settings.payment_method.trim() || !settings.payment_instructions.trim() || !settings.terms.trim())) { toast('Set both prices, payment method, instructions and terms before enabling promotions.', 'error'); return; }
    setSaving(true);
    try {
      const { error: e } = await supabase.from('promotion_settings').update({ ...settings, listing_price: listing, profile_price: profile, duration_days: days }).eq('id', true);
      if (e) throw e;
      toast('Promotion settings saved. Existing quotes keep their original price and terms.');
    } catch (e) { toast(promotionError(e), 'error'); } finally { setSaving(false); }
  };
  const act = async () => {
    if (!review) return;
    setSaving(true);
    try {
      const { error: e } = await supabase.rpc('review_promotion', { p_id: review.request.id, p_action: review.action, p_note: note });
      if (e) throw e;
      setReview(null); await loadRequests(); toast('Promotion updated and the member notified.');
    } catch (e) { toast(promotionError(e), 'error'); } finally { setSaving(false); }
  };
  return <div className="space-y-5">
    {error && <p role="alert" className="text-sm text-danger">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
    {!settings && !error && <p>Loading promotion settings…</p>}
    {settings && <section className="card p-4 sm:p-6">
      <h2 className="font-display text-lg font-bold">Paid promotion settings</h2>
      <p className="mt-2 text-sm text-ink-500">Members can pay for clearly labelled Sponsored placement. Verify payment in your payment account before approving. This does not collect money automatically or approve a listing/history.</p>
      <label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} /> Enable paid promotions</label>
      <p className="mt-1 text-xs text-ink-500">Turning this off hides sponsored placement and prevents new quotes; existing end dates continue to run. Resolve or refund affected purchases through support.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">Listing price (KES)<input className="input mt-1" type="number" min="0" step="0.01" value={draft.listing_price} onChange={e => setDraft({ ...draft, listing_price: e.target.value })} /></label>
        <label className="block text-sm">Profile price (KES)<input className="input mt-1" type="number" min="0" step="0.01" value={draft.profile_price} onChange={e => setDraft({ ...draft, profile_price: e.target.value })} /></label>
        <label className="block text-sm">Duration (days)<input className="input mt-1" type="number" min="1" max="365" value={draft.duration_days} onChange={e => setDraft({ ...draft, duration_days: e.target.value })} /></label>
      </div>
      <label className="mt-4 block text-sm">Payment method<input className="input mt-1" maxLength={100} value={settings.payment_method} onChange={e => setSettings({ ...settings, payment_method: e.target.value })} placeholder="e.g. M-Pesa Paybill or bank transfer" /></label>
      <label className="mt-4 block text-sm">Payment instructions<textarea className="input mt-1" rows={3} maxLength={2000} value={settings.payment_instructions} onChange={e => setSettings({ ...settings, payment_instructions: e.target.value })} placeholder="Receiving account, account name, and reference instructions. Never enter private keys or passwords." /></label>
      <label className="mt-4 block text-sm">Terms & refund policy<textarea className="input mt-1" rows={3} maxLength={2000} value={settings.terms} onChange={e => setSettings({ ...settings, terms: e.target.value })} /></label>
      <p className="mt-2 text-xs text-ink-500">Prices, payment instructions and terms are visible to members. Do not put secrets here.</p>
      <button type="button" className="btn-primary mt-4" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save promotion settings'}</button>
    </section>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-bold">Payment review ({requests.filter(r => r.status === 'pending').length})</h2><button type="button" className="btn-secondary" onClick={() => void loadRequests().catch(e => toast(promotionError(e), 'error'))}>Refresh requests</button></div>
    {requests.length === 0 && <p className="text-sm text-ink-500">No promotion requests yet.</p>}
    {requests.map(r => <article key={r.id} className="card p-4">
      <div className="flex flex-wrap justify-between gap-2"><Link to={`/members/${r.user_id}`} className="font-semibold hover:underline">{r.member?.full_name || 'Member'} <span className="text-xs capitalize text-ink-500">· {r.member?.role}</span></Link><span className="badge-neutral capitalize">{promotionStatus(r).replace(/_/g, ' ')}</span></div>
      <p className="mt-2 text-sm">{promotionTitle(r)} · {formatMoney(r.amount)} · {r.duration_days} days</p>
      <p className="mt-1 text-xs text-ink-500">Requested {formatDateTime(r.created_at)}{r.expires_at && ` · Ends ${formatDateTime(r.expires_at)}`}</p>
      <p className="mt-2 break-words text-sm"><strong>{r.payment_method}</strong> · Reference: {r.payment_reference || 'Not submitted'}</p>
      <details className="mt-2 text-xs text-ink-500"><summary className="cursor-pointer">Quoted payment details & terms</summary><p className="mt-2 whitespace-pre-wrap break-words">{r.payment_instructions}</p><p className="mt-2 whitespace-pre-wrap break-words">{r.terms}</p></details>
      {r.admin_note && <p className="mt-2 whitespace-pre-wrap break-words text-sm">Admin note: {r.admin_note}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{(r.status === 'pending' ? ['approve','reject'] : r.status === 'awaiting_payment' ? ['reject'] : promotionStatus(r) === 'active' ? ['cancel'] : []).map(action => <button type="button" key={action} className={action === 'approve' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setReview({ request: r, action: action as 'approve' | 'reject' | 'cancel' }); setNote(''); setConfirmed(false); }}>{action === 'approve' ? 'Verify payment & activate' : action === 'reject' ? 'Reject request' : 'End promotion'}</button>)}</div>
    </article>)}
    {review && <Modal title={review.action === 'approve' ? 'Confirm received payment' : 'Update promotion'} onClose={() => { if (!saving) setReview(null); }}>
      <p className="text-sm text-ink-600">{promotionTitle(review.request)} · {formatMoney(review.request.amount)} · Reference {review.request.payment_reference || 'not submitted'}</p>
      {review.action === 'approve' && <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I independently verified the full amount in the receiving payment account. A transaction reference alone is not proof of payment.</label>}
      <label className="mt-4 block text-sm">{review.action === 'approve' ? 'Message to member (optional)' : 'Reason and refund instructions (required)'}<textarea rows={3} maxLength={2000} className="input mt-1" value={note} onChange={e => setNote(e.target.value)} /></label>
      <button type="button" disabled={saving || (review.action === 'approve' ? !confirmed : note.trim().length < 3)} className="btn-primary mt-4 w-full" onClick={() => void act()}>{saving ? 'Updating…' : review.action === 'approve' ? 'Activate promotion' : 'Confirm update'}</button>
    </Modal>}
  </div>;
}

export function OwnerListingAllowance({ ownerId }: { ownerId: string }) {
  const [limit, setLimit] = useState('3');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => {
    let cancelled = false;
    void supabase.from('owner_listing_limits').select('max_listings').eq('owner_id', ownerId).maybeSingle().then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) setError('Could not load this owner’s allowance.');
      else { setLimit(String(data?.max_listings ?? 3)); setLoaded(true); }
    });
    return () => { cancelled = true; };
  }, [ownerId]);
  const save = async () => {
    if (!Number.isInteger(Number(limit)) || Number(limit) < 3 || Number(limit) > 100) { toast('Enter a whole number from 3 to 100.', 'error'); return; }
    setSaving(true);
    try {
      const { error: e } = await supabase.from('owner_listing_limits').upsert({ owner_id: ownerId, max_listings: Number(limit), updated_at: new Date().toISOString() });
      if (e) throw e;
      toast('Owner listing allowance updated.');
    } catch (e) { toast(promotionError(e), 'error'); } finally { setSaving(false); }
  };
  return <section className="mt-4 rounded-xl border border-ink-100 p-3"><label className="label" htmlFor="owner-listing-limit">Car listing allowance</label><p className="mb-2 text-xs text-ink-500">Default: 3 cars. Approve a higher allowance after reviewing the owner’s support request. Lowering the limit never deletes existing cars.</p>{error && <p className="text-sm text-danger">{error}</p>}<div className="flex flex-wrap gap-2"><input id="owner-listing-limit" className="input min-w-0 flex-1" type="number" min="3" max="100" value={limit} onChange={e => setLimit(e.target.value)} disabled={!loaded || saving} /><button type="button" className="btn-secondary" disabled={!loaded || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save allowance'}</button></div></section>;
}
