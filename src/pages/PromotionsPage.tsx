import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { PromotionAnalytics } from '@/components/PromotionAnalytics';
import { BackButton } from '@/components/BackButton';
import { usePromotionLive, matchingPromotions } from '@/lib/promotionLive';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { promotionError, promotionStatus, promotionTitle, type PromotionRequest, type PromotionSettings } from '@/lib/promotions';

export function PromotionsPage() {
  const { campaigns, enabled } = usePromotionLive();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [settings, setSettings] = useState<PromotionSettings | null>(null);
  const [requests, setRequests] = useState<PromotionRequest[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; make: string; model: string }[]>([]);
  const [target, setTarget] = useState(params.get('vehicle') || 'profile');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const promoted = matchingPromotions(campaigns, target === 'profile' ? 'profile' : 'listing', target === 'profile' ? user?.id || '' : target, user?.id).length > 0;
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [s, r, v] = await Promise.all([
        supabase.from('promotion_settings').select('*').single(),
        supabase.from('promotion_requests').select('*, vehicle:vehicles(make,model)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('vehicles').select('id,make,model').eq('owner_id', user.id).eq('status', 'active').eq('approval_status', 'approved').is('deleted_at', null),
      ]);
      if (s.error || r.error || v.error) throw s.error || r.error || v.error;
      setSettings(s.data); setRequests(r.data || []); setVehicles(v.data || []); setError('');
    } catch (e) { setError(promotionError(e)); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (profile?.role === 'owner' && (target === 'profile' || !target)) setTarget(vehicles[0]?.id || '');
  }, [profile?.role, target, vehicles]);
  const create = async () => {
    if (!enabled || !target || (target === 'profile' && profile?.role !== 'driver')) return;
    setBusy(true);
    try {
      const { error: e } = await supabase.rpc('request_promotion', { p_kind: target === 'profile' ? 'profile' : 'listing', p_vehicle_id: target === 'profile' ? null : target });
      if (e) throw e;
      await load(); toast('Your quote is ready below. No payment has been taken.');
    } catch (e) { toast(promotionError(e), 'error'); }
    finally { setBusy(false); }
  };
  return <div className="container-content max-w-4xl py-6">
    <BackButton to="/dashboard" />
    <h1 className="mt-3 flex items-center gap-2 font-display text-2xl font-bold"><Megaphone className="h-6 w-6 text-brand-600" /> Promotions</h1>
    <p className="mt-2 text-sm text-ink-500">Optional paid placement. Ads are labelled Sponsored, respect search filters, and never replace admin approval or platform-history review.</p>
    {error && <div role="alert" className="mt-4 text-sm text-danger">{error} <button type="button" onClick={() => void load()} className="underline">Retry</button></div>}
    {!settings && !error && <p className="mt-4">Loading promotion options…</p>}
    {settings && <div className="card mt-5 p-4 sm:p-6">
      {!settings.enabled ? <p className="text-sm text-ink-600">New promotions are currently unavailable. Existing requests and payment details remain below. <Link to="/contact" className="underline">Contact support</Link> for help.</p> : <>
        <h2 className="font-semibold">Choose what to promote</h2>
        <label className="label mt-4" htmlFor="promotion-target">{profile?.role === 'owner' ? 'Choose a car' : 'Profile or listing'}</label>
        <select id="promotion-target" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>{profile?.role === 'driver' && <option value="profile">My driver profile</option>}{profile?.role === 'owner' && vehicles.length === 0 && <option value="">No approved cars available</option>}{vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}</select>
        <p className="mt-2 text-xs text-ink-500">Drivers can promote their profile. Car owners can only promote individual live, approved cars. Visibility is subject to availability and search filters.</p>
        <p className="mt-4 text-lg font-bold">{formatMoney(target === 'profile' ? settings.profile_price : settings.listing_price)} <span className="text-sm font-normal text-ink-500">for {settings.duration_days} days</span></p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink-600">{settings.terms}</p>
        <button type="button" disabled={busy || promoted || !enabled || !target || (target === 'profile' && profile?.role !== 'driver')} onClick={() => void create()} className="btn-primary mt-4">{promoted ? 'Promoted · Analytics below' : busy ? 'Preparing quote…' : 'Get quote & payment instructions'}</button>
        <p className="mt-2 text-xs text-ink-500">No charge on this button. Check the saved quote, pay using its instructions, then submit your transaction reference. Never share a payment PIN or password.</p>
      </>}
    </div>}
    <button type="button" aria-expanded={showAnalytics} aria-controls="user-promotion-analytics" onClick={() => setShowAnalytics(value => !value)} className="btn-secondary mt-5 border-emerald-500 text-emerald-700 dark:text-emerald-300">
      {showAnalytics ? 'Hide analytics' : 'View analytics'}
    </button>
    <div id="user-promotion-analytics">{showAnalytics && <PromotionAnalytics />}</div>
    <h2 className="mt-7 font-display text-lg font-bold">My promotion history</h2>
    {settings && requests.length === 0 && <p className="mt-3 text-sm text-ink-500">No promotion requests yet.</p>}
    <div className="mt-3 space-y-4">{requests.map(r => <PromotionRequestCard key={r.id} request={r} refresh={load} />)}</div>
  </div>;
}

function PromotionRequestCard({ request: r, refresh }: { request: PromotionRequest; refresh: () => Promise<void> }) {
  const [reference, setReference] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancel, setCancel] = useState(false);
  const { toast } = useToast();
  const act = async (cancelling = false) => {
    setBusy(true);
    try {
      const result = cancelling ? await supabase.rpc('cancel_unpaid_promotion', { p_id: r.id }) : await supabase.rpc('submit_promotion_payment', { p_id: r.id, p_reference: reference.trim() });
      if (result.error) throw result.error;
      toast(cancelling ? 'Unpaid request cancelled.' : 'Reference submitted. Admin will verify receipt before activation.');
      await refresh();
    } catch (e) { toast(promotionError(e), 'error'); }
    finally { setBusy(false); }
  };
  return <article className="card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{promotionTitle(r)}</h3><span className="badge-neutral capitalize">{promotionStatus(r).replace(/_/g, ' ')}</span></div>
    <p className="mt-2 text-sm text-ink-600">{formatMoney(r.amount)} · {r.duration_days} days · Requested {formatDateTime(r.created_at)}</p>
    {r.expires_at && <p className="mt-2 text-sm text-ink-600">Promotion ends: {formatDateTime(r.expires_at)}</p>}
    {r.admin_note && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3 text-sm">Admin: {r.admin_note}</p>}
    {r.status === 'awaiting_payment' && <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
      <h4 className="font-semibold">Pay via {r.payment_method}</h4><p className="whitespace-pre-wrap break-words text-sm text-ink-600">{r.payment_instructions}</p>
      <p className="whitespace-pre-wrap break-words text-xs text-ink-500">{r.terms}</p>
      <label className="block text-sm">Transaction reference<input className="input mt-1" maxLength={120} value={reference} onChange={e => setReference(e.target.value)} placeholder="Reference on your payment receipt" /></label>
      <label className="flex items-start gap-2 text-sm text-ink-600"><input type="checkbox" className="mt-1" checked={accepted} onChange={e => setAccepted(e.target.checked)} />I have paid the quoted amount and agree to these promotion terms.</label>
      <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy || !accepted || reference.trim().length < 3} onClick={() => void act()}>{busy ? 'Submitting…' : 'Submit payment for review'}</button><button type="button" disabled={busy} className="btn-ghost" onClick={() => setCancel(true)}>Cancel unpaid request</button></div>
    </div>}
    {r.status === 'pending' && <p className="mt-3 text-sm text-ink-500">Payment reference: {r.payment_reference}. Awaiting admin confirmation; the promotion is not live yet.</p>}
    {cancel && <ConfirmDialog title="Cancel unpaid request?" message="Cancel only if you have not paid. If you have paid, submit your reference or contact support so your payment can be traced." confirmLabel="Cancel unpaid request" onConfirm={() => act(true)} onClose={() => setCancel(false)} />}
  </article>;
}
