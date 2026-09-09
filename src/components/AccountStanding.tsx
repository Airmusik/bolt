import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LockKeyhole, Star, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, titleCase } from '@/lib/utils';
import { useAuth } from '@/lib/useAuth';

interface Standing {
  rating: number; review_average: number; review_count: number;
  reports: { id: string; reason: string; description: string | null; status: string; created_at: string }[];
  warnings: { id: string; message: string; report_reason: string; report_description: string | null; created_at: string }[];
  removed_reports?: { id: string; reason: string; dismissal_reason: string; dismissed_at: string }[];
}

export function AccountStanding() {
  const { user } = useAuth();
  const [data, setData] = useState<Standing | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const result = await supabase.rpc('my_account_standing');
      if (result.error) throw result.error;
      setData(result.data as Standing);
    } catch { setError('Your private account details could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!user?.id) return;
    const refresh = () => { void load(); };
    const channel = supabase.channel(`standing-${user.id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, refresh).subscribe();
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('focus', refresh); void supabase.removeChannel(channel); };
  }, [user?.id, load]);
  return <section className="card mt-6 p-4 sm:p-6">
    <p className="flex items-center gap-1.5 text-xs font-medium text-ink-500"><LockKeyhole className="h-3.5 w-3.5" /> Only you can see these details</p>
    <h2 className="mt-1 font-display text-lg font-bold text-ink-900">My rating & warnings</h2>
    {error ? <div className="mt-3 text-sm text-danger">{error} <button type="button" className="underline" onClick={() => void load()}>Try again</button></div> : !data ? <p className="mt-3 text-sm text-ink-500">Loading account standing…</p> : <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label="Current rating" value={`${Number(data.rating).toFixed(1)} / 5`} />
        <Metric label={data.review_count ? `Average of ${data.review_count} reviews` : 'Starting rating · no reviews'} value={Number(data.review_average).toFixed(1)} />
        <Metric label="Report deductions" value={`−${(data.reports.length * 0.1).toFixed(1)}`} />
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-500">Your starting score is 5. Once you receive reviews, their average becomes your base score. Under the current rating rules, each report marked reviewing or resolved subtracts 0.1 stars (10 reports = 1 star), with a minimum score of 1. Open and dismissed reports do not reduce it. Warnings are not an extra deduction.</p>
      <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold text-ink-900"><Star className="h-4 w-4" /> What affected my rating?</h3>
      <p className="mt-1 text-sm text-ink-500">Individual member reviews are listed in Reviews below.</p>
      {data.reports.length === 0 ? <p className="mt-3 text-sm text-success">No report deductions.</p> : <div className="mt-3 space-y-3">{data.reports.map((report) => <div key={report.id} className="rounded-xl border border-ink-100 p-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong>{titleCase(report.reason.replace(/_/g, ' '))}</strong><span className="font-semibold text-danger">−0.1 stars</span></div>
        <p className="mt-1 whitespace-pre-wrap break-words text-ink-600">{report.description || 'No additional description.'}</p>
        <p className="mt-2 text-xs text-ink-500">{titleCase(report.status)} · {formatDateTime(report.created_at)}</p>
      </div>)}</div>}
      <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold text-ink-900"><AlertTriangle className="h-4 w-4" /> Warnings ({data.warnings.length})</h3>
      {data.warnings.length === 0 ? <p className="mt-2 text-sm text-success">You have no warnings.</p> : <>
        <p className="mt-2 text-sm text-ink-600">Three warnings may lead to suspension. Contact support if you believe a warning is incorrect.</p>
        <div className="mt-3 space-y-3">{data.warnings.map((warning) => <div key={warning.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-semibold">{titleCase(warning.report_reason.replace(/_/g, ' '))}</p>
          {warning.report_description && <p className="mt-1 whitespace-pre-wrap break-words">Report: {warning.report_description}</p>}
          <p className="mt-2 whitespace-pre-wrap break-words">{warning.message}</p><p className="mt-2 text-xs">{formatDateTime(warning.created_at)}</p>
        </div>)}</div>
      </>}
      {!!data.removed_reports?.length && <details className="mt-5 rounded-xl border border-emerald-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Removed reports ({data.removed_reports.length}) · no rating deduction</summary>{data.removed_reports.map(report => <div key={report.id} className="mt-3 text-sm"><p className="font-semibold">{report.reason}</p><p className="mt-1 whitespace-pre-wrap break-words text-ink-600">{report.dismissal_reason}</p><p className="mt-1 text-xs text-ink-500">Removed {formatDateTime(report.dismissed_at)}. Any warning from this report no longer counts.</p></div>)}</details>}
      <Link to="/contact?topic=account-standing" className="btn-secondary mt-4">Ask support about my account</Link>
    </>}
  </section>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-ink-50 p-3"><p className="text-xl font-bold text-ink-900">{value}</p><p className="mt-1 text-xs text-ink-500">{label}</p></div>; }
