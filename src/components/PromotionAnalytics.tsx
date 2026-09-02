import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { usePromotionLive } from '@/lib/promotionLive';
import { promotionStatus, promotionTitle, type PromotionRequest } from '@/lib/promotions';
import { formatDateTime } from '@/lib/utils';

type Metric = { promotion_id: string; reach: number; clicks: number };
export function PromotionAnalytics({ admin = false, compact = false }: { admin?: boolean; compact?: boolean }) {
  const { user } = useAuth();
  const { revision } = usePromotionLive();
  const [rows, setRows] = useState<PromotionRequest[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    let requests = supabase.from('promotion_requests').select('*, member:profiles!promotion_requests_user_id_fkey(full_name,role), vehicle:vehicles(make,model)').not('starts_at', 'is', null).order('created_at', { ascending: false });
    if (!admin) requests = requests.eq('user_id', user.id);
    const [r, m] = await Promise.all([requests, supabase.rpc('promotion_analytics')]);
    if (r.error || m.error) { setError('Promotion analytics could not be loaded.'); return; }
    setRows(r.data || []); setMetrics(m.data || []); setError(''); setLoaded(true);
  }, [user, admin]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30000); return () => clearInterval(timer); }, [load, revision]);
  const filtered = rows.filter(r => `${r.member?.full_name || ''} ${promotionTitle(r)} ${r.id} ${promotionStatus(r)}`.toLowerCase().includes(query.toLowerCase()));
  const visible = compact ? filtered.slice(0, 3) : filtered;
  if (compact && loaded && !error && rows.length === 0) return null;
  return <section className="card my-5 p-4" aria-label="Promotion analytics">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-lg font-bold">Promotion analytics</h2><button type="button" className="btn-ghost text-xs" onClick={() => void load()}>Refresh analytics</button></div>
    <p className="mt-1 text-xs text-ink-500">Reach: unique browsers that saw a promoted card. Clicks: unique browsers that opened it. Owner/admin activity excluded. Tracking starts with this update; earlier activity is unavailable.</p>
    {!compact && <label className="mt-3 block text-sm">Search {admin ? 'member, listing, or status' : 'promotion or status'}<input className="input mt-1" value={query} onChange={e => setQuery(e.target.value)} placeholder={admin ? 'Member name, car, active, expired…' : 'Car, profile, active, expired…'} /></label>}
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : !loaded ? <p className="mt-3 text-sm">Loading analytics…</p> : <>
      {visible.length === 0 && <p className="mt-3 text-sm text-ink-500">{query ? 'No matching promotions.' : 'No activated promotions yet.'}</p>}
      <div className="mt-3 space-y-3">{visible.map(r => {
        const metric = metrics.find(m => m.promotion_id === r.id);
        const reach = Number(metric?.reach || 0), clicks = Number(metric?.clicks || 0);
        const status = promotionStatus(r);
        return <article key={r.id} className="rounded-xl border border-ink-100 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-semibold">{admin && `${r.member?.full_name || 'Member'} · `}{promotionTitle(r)}</span><span className={status === 'active' ? 'badge-accent' : 'badge-neutral'}>{status === 'active' ? 'Promoted' : status}</span></div>
          <dl className="mt-3 grid grid-cols-3 gap-2"><div><dt className="text-xs text-ink-500">Reach</dt><dd className="text-lg font-bold">{reach.toLocaleString()}</dd></div><div><dt className="text-xs text-ink-500">Clicks</dt><dd className="text-lg font-bold">{clicks.toLocaleString()}</dd></div><div><dt className="text-xs text-ink-500">Click rate</dt><dd className="text-lg font-bold">{reach ? (clicks / reach * 100).toFixed(1) : '0'}%</dd></div></dl>
          {r.expires_at && <p className="mt-2 text-xs text-ink-500">{status === 'expired' ? 'Expired' : 'Ends'} {formatDateTime(r.expires_at)} · {r.duration_days} days from activation</p>}
          {status === 'expired' && <p className="mt-1 text-xs text-ink-500">Promotion ended. The listing/profile remains at normal visibility, subject to its usual approval and availability.</p>}
        </article>;
      })}</div>
    </>}
    {compact && <Link to="/promotions" className="btn-ghost mt-3 text-sm">View all promotions</Link>}
  </section>;
}
