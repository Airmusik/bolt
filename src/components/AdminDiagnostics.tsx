import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
type Diagnostic = { hour: string; route: string; kind: string; browser: string; release: string; hits: number; last_seen: string };
export function AdminDiagnostics() {
  const [rows, setRows] = useState<Diagnostic[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: failure } = await supabase.rpc('admin_client_diagnostics');
      if (failure) throw failure;
      setRows(Array.isArray(data) ? data : []); setError('');
    } catch { setError('Website health could not load. Please retry.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className="card p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-ink-900">Website health</h3><p className="mt-1 text-xs leading-5 text-ink-500">Browser error signals from the last 30 days. Counts may include retries or blocked downloads; they are not proof of a security incident. No message text, passwords, contact details or full URLs are collected.</p></div><button type="button" className="btn-secondary shrink-0 text-xs" disabled={loading} onClick={() => void load()}>{loading ? 'Loading…' : 'Refresh'}</button></div>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : !loading && !rows.length ? <p className="mt-3 text-sm text-ink-600">No browser errors have been recorded. This does not replace uptime checks.</p> : <div className="mt-3 space-y-2">{rows.map(row => <div key={`${row.hour}:${row.route}:${row.kind}:${row.browser}`} className="rounded-lg border border-ink-200 p-3 text-sm"><p className="font-semibold text-ink-900">{row.route} · {row.kind} · {row.hits} report(s)</p><p className="mt-1 text-xs text-ink-500">{row.browser} · Release {row.release.slice(0,7)} · {new Date(row.last_seen).toLocaleString()}</p></div>)}</div>}
  </section>;
}
