import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, RefreshCw, Star } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';

interface Feedback {
  id: string; user_id: string; kind: 'site' | 'chat'; rating: number;
  comment: string; created_at: string; reviewed_at: string | null;
  member: { full_name: string; role: string } | null;
}

export function AdminFeedback() {
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [limit, setLimit] = useState(30);
  const [rows, setRows] = useState<Feedback[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError('');
    try {
      let query = supabase.from('experience_feedback').select('id,user_id,kind,rating,comment,created_at,reviewed_at,member:profiles!experience_feedback_user_id_fkey(full_name,role)').order('created_at', { ascending: false }).limit(limit + 1);
      if (kind !== 'all') query = query.eq('kind', kind);
      if (status === 'new') query = query.is('reviewed_at', null);
      if (status === 'reviewed') query = query.not('reviewed_at', 'is', null);
      const { data, error: failure } = await query;
      if (current !== generation.current) return;
      if (failure) throw new Error(failure.message);
      setRows((data || []).slice(0, limit) as unknown as Feedback[]);
      setHasMore((data?.length || 0) > limit);
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error ? failure.message : 'Could not load feedback. Please retry.');
    } finally { if (current === generation.current) setLoading(false); }
  }, [kind, status, limit]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { void load(); return invalidate; }, [load, invalidate]);
  const review = async (id: string) => {
    if (saving) return;
    setSaving(id); setError('');
    try {
      const { error: failure } = await supabase.rpc('admin_mark_feedback_reviewed', { p_id: id });
      if (failure) throw new Error(failure.message);
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not mark feedback reviewed.'); }
    finally { setSaving(null); }
  };
  return <section aria-label="Member experience feedback" className="space-y-4">
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-ink-900">Experience feedback</h2><p className="mt-1 max-w-2xl text-sm text-ink-600">Private ratings and opinions about the site and messaging, separate from public member reviews. Chat feedback does not grant access to a private conversation.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn-secondary"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink-700">Feedback type<select className="input mt-1" value={kind} onChange={event => { setKind(event.target.value); setLimit(30); }}><option value="all">All experiences</option><option value="site">Site experience</option><option value="chat">Chat experience</option></select></label>
        <label className="text-sm font-medium text-ink-700">Review status<select className="input mt-1" value={status} onChange={event => { setStatus(event.target.value); setLimit(30); }}><option value="all">All feedback</option><option value="new">Needs review</option><option value="reviewed">Reviewed</option></select></label>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 p-4 text-sm text-danger">Could not complete the request: {error}</p>}
    {loading && <p role="status" className="text-sm text-ink-500">Loading feedback…</p>}
    {!loading && !error && rows.length === 0 && <p className="card p-6 text-center text-ink-600">No feedback in this category yet.</p>}
    {rows.map(row => <article key={row.id} className="card p-4 sm:p-5">
      <div className="flex flex-wrap justify-between gap-2">
        <div><h3 className="font-semibold text-ink-900">{row.member?.full_name || 'Member'}</h3><p className="text-xs text-ink-500">{row.member?.role === 'owner' ? 'Car owner' : row.member?.role === 'driver' ? 'Driver' : 'Member'} · {row.kind === 'chat' ? 'Chat experience' : 'Site experience'} · {formatDateTime(row.created_at)}</p></div>
        <span className="flex items-center gap-1 self-start text-sm font-bold text-ink-800"><Star className="h-4 w-4 fill-amber-400 text-amber-500" aria-hidden="true" /> {row.rating}/5</span>
      </div>
      <p className="my-3 whitespace-pre-wrap break-words text-sm text-ink-700">{row.comment || 'No written comment provided.'}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/members/${row.user_id}`} className="btn-secondary min-h-11 px-3 py-2 text-xs">View member</Link>
        {row.reviewed_at ? <span className="text-xs text-ink-500">Reviewed {formatDateTime(row.reviewed_at)}</span> : <button type="button" disabled={!!saving} onClick={() => void review(row.id)} className="btn-secondary min-h-11 px-3 py-2 text-xs"><Check className="h-4 w-4" /> {saving === row.id ? 'Saving…' : 'Mark reviewed'}</button>}
      </div>
    </article>)}
    {hasMore && <button type="button" disabled={loading} onClick={() => setLimit(value => value + 30)} className="btn-secondary">Load more feedback</button>}
  </section>;
}
