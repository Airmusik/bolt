import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

export function ReportRemovalAction({ onRemove }: { onRemove: (reason: string) => Promise<boolean> }) {
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  return <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
    <h3 className="font-semibold text-ink-900">Was this report incorrect?</h3>
    <p className="mt-1 text-sm text-ink-600">Remove its rating deduction and revoke its warning. Other valid reports and member reviews still count. The case stays in the admin history.</p>
    {!expanded ? <button type="button" onClick={() => setExpanded(true)} className="btn-secondary mt-3"><RotateCcw className="h-4 w-4" />Remove report & restore rating</button> : <div className="mt-3 space-y-3">
      <label className="block text-sm font-medium">Reason for removing this report<textarea className="input mt-1" rows={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the evidence or mistake that led to this decision." /></label>
      <p className="text-xs text-ink-500">10–2000 characters. The reported member will receive this explanation. This does not automatically lift an account suspension.</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || reason.trim().length < 10} onClick={() => setConfirm(true)} className="btn-primary">Review removal</button><button type="button" disabled={busy} onClick={() => setExpanded(false)} className="btn-ghost">Cancel</button></div>
    </div>}
    {confirm && <ConfirmDialog title="Remove this report from account standing?" message="Only this report’s deduction and warning will be removed. The rating will be recalculated from the remaining reviews and reports, and the member will be notified. The original report and your decision remain saved for audit." confirmLabel="Remove report & restore rating" onClose={() => { if (!busy) setConfirm(false); }} onConfirm={async () => {
      setBusy(true);
      try { if (await onRemove(reason.trim())) { setExpanded(false); setReason(''); } }
      finally { setBusy(false); setConfirm(false); }
    }} />}
  </section>;
}
