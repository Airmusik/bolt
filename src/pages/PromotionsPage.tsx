import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, Megaphone } from 'lucide-react';
import { PromotionAnalytics } from '@/components/PromotionAnalytics';
import { PromotionRequestCard } from '@/components/PromotionRequestCard';
import { PromotionDraftActions } from '@/components/PromotionDraftActions';
import { BackButton } from '@/components/BackButton';
import { usePromotionLive, matchingPromotions } from '@/lib/promotionLive';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import { formatMoney } from '@/lib/utils';
import { isCurrentPromotion, promotionError, type PromotionRequest, type PromotionSettings } from '@/lib/promotions';

export function PromotionsPage() {
  const { campaigns, enabled } = usePromotionLive();
  const { user, profile } = useAuth();
  const userId = user?.id;
  const { toast } = useToast();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PromotionSettings | null>(null);
  const [requests, setRequests] = useState<PromotionRequest[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; make: string; model: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [target, setTarget] = useState(params.get('vehicle') || 'profile');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [focusRequest, setFocusRequest] = useState('');
  const current = requests.filter(isCurrentPromotion);
  const previous = requests.filter(r => !isCurrentPromotion(r));
  const existing = current.find(r => target === 'profile' ? r.kind === 'profile' : r.kind === 'listing' && r.vehicle_id === target);
  const quotedPrice = existing?.amount ?? (target === 'profile' ? settings?.profile_price : settings?.listing_price) ?? 0;
  const quotedDays = existing?.duration_days ?? settings?.duration_days ?? 0;
  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const [s, r, v] = await Promise.all([
        supabase.from('promotion_settings').select('*').single(),
        supabase.from('promotion_requests').select('*, vehicle:vehicles(make,model)').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('vehicles').select('id,make,model').eq('owner_id', userId).eq('status', 'active').eq('approval_status', 'approved').is('deleted_at', null),
      ]);
      if (s.error || r.error || v.error) throw s.error || r.error || v.error;
      setSettings(s.data); setRequests(r.data || []); setVehicles(v.data || []); setLoaded(true); setError('');
    } catch (e) { setError(promotionError(e)); }
  }, [userId]);
  useEffect(() => {
    void load();
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 20000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load]);
  useEffect(() => {
    if (!loaded) return;
    if (profile?.role === 'driver') setTarget('profile');
    else if (profile?.role === 'owner' && !vehicles.some(v => v.id === target)) setTarget(vehicles[0]?.id || '');
  }, [profile?.role, target, vehicles, loaded]);
  useEffect(() => {
    if (!focusRequest) return;
    const card = document.getElementById('promotion-' + focusRequest);
    if (!card) return;
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    setFocusRequest('');
  }, [focusRequest, requests]);
  const create = async () => {
    if (existing) { setFocusRequest(existing.id); return; }
    if (submitting.current || !settings?.enabled || !target || (target === 'profile' && profile?.role !== 'driver')) return;
    submitting.current = true; setBusy(true);
    try {
      const { data, error: e } = await supabase.rpc('request_promotion', { p_kind: target === 'profile' ? 'profile' : 'listing', p_vehicle_id: target === 'profile' ? null : target });
      if (e) throw e;
      await load(); setFocusRequest(data.id); toast('Payment instructions ready. No payment has been taken.');
    } catch (e) { toast(promotionError(e), 'error'); }
    finally { submitting.current = false; setBusy(false); }
  };
  const action = async (id: string, reference: string | null) => {
    const result = reference === null ? await supabase.rpc('cancel_unpaid_promotion', { p_id: id }) : await supabase.rpc('submit_promotion_payment', { p_id: id, p_reference: reference });
    if (result.error) throw result.error;
    await load(); toast(reference === null ? 'Unpaid request cancelled.' : 'Payment reference sent. Admin will confirm receipt before your promotion starts.');
  };
  const card = (r: PromotionRequest) => <PromotionRequestCard key={r.id} request={r} onAction={action} paused={settings?.enabled === false} visible={enabled && matchingPromotions(campaigns, r.kind, r.kind === 'profile' ? r.user_id : r.vehicle_id || '', r.user_id).length > 0} />;
  return <div className="container-content max-w-4xl space-y-5 py-6">
    <BackButton to="/dashboard" />
    <header><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700"><Megaphone className="h-4 w-4" />Optional paid promotion</p><h1 className="mt-2 font-display text-2xl font-bold text-ink-900 sm:text-3xl">Get more visibility</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600">{profile?.role === 'owner' ? 'Promote a car in the top promoted section on car searches across Kenya.' : 'Promote your driver profile in the top promoted section on driver searches across Kenya.'} It is labelled Promoted. Connections and enquiries are not guaranteed.</p></header>
    <ol aria-label="How promotion works" className="grid gap-3 sm:grid-cols-3">{[
      ['Choose', 'Select your car or profile and check the price.'], ['Pay & send reference', 'Follow the saved instructions, then send your payment code.'], ['Admin confirms', 'Your promotion starts after payment is checked.'],
    ].map(([title, text], i) => <li key={title} className="flex gap-3 rounded-xl border border-ink-200 bg-white p-3 dark:bg-[#24272e]"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold">{i + 1}</span><div><p className="text-sm font-semibold text-ink-900">{title}</p><p className="mt-1 text-xs leading-5 text-ink-500">{text}</p></div></li>)}</ol>
    {error && <div role="alert" className="rounded-xl border border-red-200 p-3 text-sm text-danger">{error} <button type="button" onClick={() => void load()} className="underline">Retry</button></div>}
    {!settings && !error && <p role="status" className="text-sm text-ink-500">Loading promotion options…</p>}
    {current.length > 0 && <section aria-labelledby="current-promotions"><h2 id="current-promotions" className="font-display text-lg font-bold text-ink-900">Your current promotions</h2><p className="mt-1 text-sm text-ink-500">Payment instructions, progress and next steps are shown here.</p><div className="mt-3 space-y-4">{current.map(card)}</div></section>}
    {settings && <section className="card p-4 sm:p-6">
      {!settings.enabled ? <div><h2 className="font-semibold">New promotions are currently paused</h2><p className="mt-2 text-sm leading-6 text-ink-600">Existing requests and their saved payment details remain above. <Link to="/contact?topic=promotion" className="underline">Contact support</Link> before sending a new payment.</p></div> : <>
        <h2 className="font-display text-lg font-bold text-ink-900">{current.length ? 'Choose or manage a promotion' : 'Choose your promotion'}</h2>
        {profile?.role === 'owner' ? <><label className="label mt-4" htmlFor="promotion-target">Which car do you want more drivers to see?</label><select id="promotion-target" className="input" value={target} onChange={e => setTarget(e.target.value)} disabled={!vehicles.length}>{!vehicles.length && <option value="">No live, approved cars yet</option>}{vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}</select><p className="mt-2 text-xs text-ink-500">Only your live, approved cars can be selected. Each car has its own promotion.</p>{!vehicles.length && <Link to="/dashboard?tab=vehicles" className="btn-secondary mt-3">View my vehicles</Link>}</> : <div className="mt-3 rounded-xl bg-ink-50 p-3"><p className="text-sm font-semibold">My driver profile</p><p className="mt-1 text-xs text-ink-500">Your profile must meet the usual approval and availability requirements to appear.</p></div>}
        {target && <><div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/30 p-4 dark:bg-brand-950/20"><p className="text-xs font-medium text-ink-500">{existing ? 'Saved price for your existing promotion' : 'Total price for this promotion'}</p><p className="mt-1 text-2xl font-bold text-ink-900">{formatMoney(quotedPrice)}</p><p className="mt-1 text-sm text-ink-600">{quotedDays} days · starts after admin confirms payment</p></div><details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Promotion terms & important information</summary><p className="mt-2 whitespace-pre-wrap break-words text-ink-600">{existing?.terms || settings.terms}</p><p className="mt-2 text-xs text-ink-500">Promotion never replaces admin approval or driver platform-history review. Approval and availability still apply. Promoted placements are separate from filtered results; matching promotions appear first.</p></details><PromotionDraftActions busy={busy} existing={!!existing} onContinue={() => void create()} onCancel={() => navigate(profile?.role === 'owner' ? '/dashboard?tab=vehicles' : '/dashboard')} /></>}
      </>}
    </section>}
    {requests.some(r => r.starts_at) && <section><button type="button" aria-expanded={showAnalytics} aria-controls="user-promotion-analytics" onClick={() => setShowAnalytics(value => !value)} className="btn-secondary"><BarChart3 className="h-4 w-4" />{showAnalytics ? 'Hide promotion results' : 'See views & clicks'}</button><div id="user-promotion-analytics">{showAnalytics && <PromotionAnalytics />}</div></section>}
    {previous.length > 0 && <details className="rounded-xl border border-ink-200 p-4"><summary className="cursor-pointer font-display text-base font-semibold">Previous promotions ({previous.length})</summary><div className="mt-3 space-y-4">{previous.map(card)}</div></details>}
    <p className="text-center text-sm text-ink-500">Not sure what to do? <Link to="/contact?topic=promotion" className="font-medium text-brand-700 underline">Ask support about promotions</Link></p>
  </div>;
}
