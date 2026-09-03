import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
type Item = { source_key: string; user_id: string; full_name: string; label: string; uploaded_at: string; expires_at: string | null; date_label: string };
type Scan = { scanned_at: string | null; automatic: boolean; items: Item[] };
export function DocumentScanner() {
  const [scan, setScan] = useState<Scan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('attention');
  const load = useCallback(async (run = false, auto: boolean | null = null) => {
    setBusy(true);
    const { data, error: problem } = await supabase.rpc('admin_document_scan', { p_run: run, p_auto: auto });
    setBusy(false); setError(problem ? problem.message : '');
    if (!problem) setScan(data);
  }, []);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 60000); return () => clearInterval(timer); }, [load]);
  const status = (item: Item) => !item.expires_at ? 'missing' : Date.parse(item.expires_at) <= Date.now() ? 'expired' : Date.parse(item.expires_at) <= Date.now()+30*86400000 ? 'soon' : 'current';
  const items = scan?.items || [];
  const visible = items.filter(i => filter === 'all' || (filter === 'attention' ? status(i) !== 'current' : status(i) === filter));
  return <section className="card space-y-4 p-5"><h2 className="text-lg font-bold">Document date scanner</h2><p className="text-sm text-ink-500">Checks every saved document, platform-history record and vehicle insurance date. Near expiry means within 30 days. Upload dates are not expiry dates; this does not read dates printed inside images or PDFs.</p>
    <div className="flex flex-wrap items-center gap-3"><button className="btn-primary" disabled={busy} onClick={() => void load(true)}>{busy ? 'Checking…' : 'Scan now'}</button><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || !scan} checked={scan?.automatic || false} onChange={e => void load(true,e.target.checked)} />Automatic scan every hour (runs when admin is offline)</label></div>
    <p className="text-xs text-ink-500">Last scan: {scan?.scanned_at ? formatDateTime(scan.scanned_at) : 'Not scanned yet'}. This scanner reports issues only; it does not hide listings or send extra emails. Existing reminder schedules are unchanged.</p>
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2">{[['attention','Needs attention'],['expired','Expired'],['soon','Expiring soon'],['missing','Missing expiry'],['all','All records']].map(([value,label]) => <button key={value} className={filter === value ? 'btn-primary text-xs' : 'btn-secondary text-xs'} onClick={() => setFilter(value)}>{label} ({items.filter(i => value === 'all' || (value === 'attention' ? status(i) !== 'current' : status(i) === value)).length})</button>)}</div>
    <div className="max-h-96 space-y-3 overflow-y-auto">{visible.map(item => <article key={item.source_key} className="rounded-xl border border-ink-200 p-3"><a href={`/members/${item.user_id}`} className="font-semibold hover:underline">{item.full_name || 'View member'}</a><p className="text-sm">{item.label}</p><p className="mt-1 text-xs text-ink-500">{item.date_label}: {formatDateTime(item.uploaded_at)}</p><p className={`mt-1 text-sm font-semibold ${status(item) === 'expired' ? 'text-red-600' : status(item) === 'current' ? 'text-emerald-600' : 'text-amber-600'}`}>{item.expires_at ? `${status(item) === 'expired' ? 'Expired' : 'Expires'}: ${formatDateTime(item.expires_at)}` : 'No expiry date recorded — review if required'}</p></article>)}{scan && !visible.length && <p className="text-sm text-ink-500">No records match this filter.</p>}</div>
  </section>;
}
