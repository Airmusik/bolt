import { useCallback, useEffect, useState } from 'react';
import { Activity, Globe2, Eye, Users, UserPlus, LogIn, Car, Link2, RefreshCw, Download, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Report = {
  views: number; sessions: number; active_members: number; online: number; signups: number; logged_in: number; listings: number; connections: number; tracking_since: string | null;
  daily: { day: string; views: number; signups: number }[];
  pages: { path: string; views: number }[];
  countries: { country: string; sessions: number; views: number }[];
};
const date = (offset = 0) => { const day = new Date(); day.setUTCDate(day.getUTCDate() + offset); return day.toISOString().slice(0, 10); };
function countryName(code: string) {
  if (code === 'ZZ') return 'Unknown country';
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; } catch { return code; }
}
export function AdminSiteAnalytics() {
  const [start, setStart] = useState(date(-6));
  const [end, setEnd] = useState(date());
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [updated, setUpdated] = useState('');
  const [metric, setMetric] = useState<'views' | 'signups'>('views');
  const [countrySearch, setCountrySearch] = useState('');
  const [revision, setRevision] = useState(0);
  const valid = !!start && !!end && start <= end && (Date.parse(end) - Date.parse(start)) / 86400000 < 90;
  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const load = async () => {
      setBusy(true);
      const { data, error: problem } = await supabase.rpc('admin_site_analytics', { p_start: start, p_end: end });
      if (cancelled) return;
      setBusy(false);
      if (problem) { setError('Analytics could not load. Please retry.'); return; }
      setError(''); setReport(data as Report); setUpdated(new Date().toLocaleTimeString());
    };
    setReport(null);
    void load();
    const timer = auto ? window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000) : undefined;
    return () => { cancelled = true; clearInterval(timer); };
  }, [start, end, auto, revision, valid]);
  const exportCsv = useCallback(() => {
    if (!report) return;
    const rows = [['Daily report (UTC)', 'Page views', 'Signups'], ...report.daily.map(d => [d.day, d.views, d.signups]), [], ['Country', 'Browser sessions', 'Page views'], ...report.countries.map(c => [countryName(c.country), c.sessions, c.views]), [], ['Page category', 'Views'], ...report.pages.map(p => [p.path, p.views])];
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `11drive-analytics-${start}-${end}.csv`; a.click(); URL.revokeObjectURL(url);
  }, [report, start, end]);
  const cards = report ? [
    { label: 'Page views', value: report.views, note: 'Measured page loads and navigation', icon: Eye, color: 'text-sky-600 bg-sky-50' },
    { label: 'Browser sessions', value: report.sessions, note: 'Distinct browser tabs, not unique people', icon: Globe2, color: 'text-violet-600 bg-violet-50' },
    { label: 'New signups', value: report.signups, note: 'Non-admin accounts created', icon: UserPlus, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Recently signed in', value: report.logged_in, note: 'Accounts whose latest login falls in this range', icon: LogIn, color: 'text-amber-600 bg-amber-50' },
    { label: 'Active members', value: report.active_members, note: 'Signed-in members with measured activity', icon: Users, color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Online now', value: report.online, note: 'Measured members active in the last 5 minutes', icon: Activity, color: 'text-green-600 bg-green-50' },
    { label: 'New listings', value: report.listings, note: 'Listings created, including pending approval', icon: Car, color: 'text-orange-600 bg-orange-50' },
    { label: 'Connection requests', value: report.connections, note: 'Requests created in the selected range', icon: Link2, color: 'text-pink-600 bg-pink-50' },
  ] : [];
  const peak = Math.max(1, ...(report?.daily.map(d => d[metric]) || []));
  return <section className="space-y-6" aria-label="Site analytics">
    <div className="rounded-2xl bg-gradient-to-r from-emerald-900 via-teal-800 to-sky-900 p-6 text-white">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">11Drive insights</p><h2 className="mt-1 text-3xl font-bold">See how your community grows</h2><p className="mt-2 text-sm text-emerald-100">Traffic, countries and marketplace activity—explained simply.</p></div><span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs"><span className="h-2 w-2 rounded-full bg-emerald-300" />{busy ? 'Updating…' : auto ? 'Refreshes every 60 seconds' : 'Manual refresh'}</span></div>
    </div>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-ink-200 p-4">
      <label className="text-xs font-medium">From (UTC)<input aria-label="Start date" type="date" value={start} max={end} onChange={e => setStart(e.target.value)} className="input mt-1 block" /></label>
      <label className="text-xs font-medium">To (UTC)<input aria-label="End date" type="date" value={end} min={start} max={date()} onChange={e => setEnd(e.target.value)} className="input mt-1 block" /></label>
      {[1, 7, 30, 90].map(days => <button key={days} className="btn-secondary text-xs" onClick={() => { setStart(date(1-days)); setEnd(date()); }}>{days === 1 ? 'Today' : `${days} days`}</button>)}
      <button className="btn-secondary" disabled={busy || !valid} onClick={() => setRevision(n => n+1)} aria-label="Refresh analytics"><RefreshCw className="h-4 w-4" /></button>
      <button className="btn-secondary text-xs" disabled={!report || !valid || !!error} onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</button>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />Auto-refresh</label>
    </div>
    {!valid && <p role="alert" className="text-red-600">Choose a valid range of up to 90 days.</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error} <button className="underline" onClick={() => setRevision(n => n+1)}>Retry</button></p>}
    {busy && !report && <p role="status">Loading your insights…</p>}
    {report && valid && <>
      <p className="text-xs text-ink-500">Updated {updated}. Traffic coverage begins {report.tracking_since ? new Date(report.tracking_since).toLocaleDateString() : 'after the first visitor allows analytics'}. {error ? 'Figures below are the last successful snapshot.' : ''}</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(card => <div key={card.label} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm dark:bg-ink-100"><span className={`inline-flex rounded-xl p-2 ${card.color}`}><card.icon className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold">{card.label}</p><p className="mt-1 text-3xl font-bold tabular-nums">{card.value.toLocaleString()}</p><p className="mt-2 text-xs text-ink-500">{card.note}</p></div>)}</div>
      <div className="rounded-2xl border border-ink-200 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold"><TrendingUp className="h-5 w-5 text-emerald-600" />Daily growth</h3><select aria-label="Chart metric" className="input w-auto" value={metric} onChange={e => setMetric(e.target.value as 'views' | 'signups')}><option value="views">Page views</option><option value="signups">Signups</option></select></div>
        <p className="mt-2 text-xs text-ink-500">One bar per day. Scroll for longer ranges; hover or focus a bar for its count.</p>
        <div className="mt-5 overflow-x-auto"><div className="flex h-48 items-end gap-2 border-b border-ink-200" style={{ minWidth: report.daily.length * 34 }}>{report.daily.map(d => <div key={d.day} className="flex h-full min-w-6 flex-1 flex-col justify-end text-center"><span className="text-[10px] text-ink-500">{d[metric]}</span><div tabIndex={0} role="img" aria-label={`${d.day}: ${d[metric]} ${metric}`} title={`${d.day}: ${d[metric]} ${metric}`} className="mx-auto w-full max-w-10 rounded-t-md bg-gradient-to-t from-teal-600 to-emerald-300" style={{ height: `${Math.max(d[metric] > 0 ? 2 : 0, d[metric] / peak * 75)}%` }} /><span className="mt-2 text-[9px] text-ink-500">{d.day.slice(5)}</span></div>)}</div></div>
        {report.daily.every(d => d[metric] === 0) && <p className="mt-4 text-sm text-ink-500">No {metric === 'views' ? 'measured page views' : 'signups'} in this period. This is real data, not sample activity.</p>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-ink-200 p-5"><h3 className="font-bold">Where visitors connect from</h3><p className="mt-1 text-xs text-ink-500">Approximate network country, not nationality. VPNs may change it.</p><input className="input mt-4 w-full" placeholder="Find a country…" aria-label="Search countries" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} />
        <div className="mt-4 max-h-80 space-y-4 overflow-y-auto">{report.countries.filter(c => countryName(c.country).toLowerCase().includes(countrySearch.toLowerCase())).map(c => <div key={c.country}><div className="flex justify-between gap-3 text-sm"><span>{countryName(c.country)}</span><span className="text-ink-500">{c.sessions} sessions · {c.views} views</span></div><div className="mt-2 h-2 rounded-full bg-ink-100"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500" style={{ width: `${c.sessions / Math.max(1, ...report.countries.map(x => x.sessions)) * 100}%` }} /></div></div>)}{!report.countries.length && <p className="text-sm text-ink-500">Countries will appear as visitors allow analytics.</p>}</div>
      </div><div className="rounded-2xl border border-ink-200 p-5"><h3 className="font-bold">Most-viewed pages</h3><p className="mt-1 text-xs text-ink-500">Page categories only—no private record IDs or search terms.</p><ol className="mt-5 space-y-4">{report.pages.map((p, i) => <li key={p.path} className="flex items-center gap-3 text-sm"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 font-bold text-emerald-700">{i+1}</span><span className="flex-1 break-all">{p.path === '/' ? 'Home' : p.path}</span><strong>{p.views.toLocaleString()}</strong></li>)}</ol>{!report.pages.length && <p className="mt-4 text-sm text-ink-500">No measured page views yet.</p>}</div></div>
      <details className="rounded-2xl bg-ink-50 p-5 text-sm"><summary className="cursor-pointer font-bold">How to read these numbers</summary><div className="mt-3 space-y-2 text-ink-600"><p>Traffic is an estimate from visitors who allow analytics. Admins and Do Not Track browsers are excluded. A session is a browser tab, so it is not a unique person; returning visits and multiple devices may count separately.</p><p>Online now is independent of the date filter. It counts consenting signed-in members whose visible page sent activity within five minutes. Active members are distinct signed-in accounts measured in the selected range.</p><p>Recently signed in counts each account once using its latest successful sign-in time. It is not a historical login-event count: signing in again outside a past range can change that past range's total.</p><p>Signups, listings and connection requests use existing operational records, including records predating traffic tracking. Deleted records are not counted. Traffic is limited to the last 90 days; older visit records are cleaned up when new activity arrives. Country totals can overlap if one session changes network country.</p></div></details>
    </>}
  </section>;
}
