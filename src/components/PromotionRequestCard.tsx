import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock3, CreditCard } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { formatDateTime, formatMoney } from '@/lib/utils';
import { promotionProgress, promotionTitle, type PromotionRequest } from '@/lib/promotions';

export function PromotionRequestCard({ request: r, visible = true, paused = false, onAction }: { request: PromotionRequest; visible?: boolean; paused?: boolean; onAction: (id: string, reference: string | null) => Promise<void> }) {
  const [reference, setReference] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [cancel, setCancel] = useState(false);
  const [error, setError] = useState('');
  const progress = promotionProgress(r, visible);
  const act = async (cancelling = false) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { await onAction(r.id, cancelling ? null : reference.trim()); }
    catch (e) { setError((e as { message?: string })?.message || 'Could not update this promotion. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <article id={`promotion-${r.id}`} tabIndex={-1} className="card scroll-mt-32 p-4 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-medium uppercase tracking-wide text-ink-500">{r.kind === 'profile' ? 'Driver profile' : 'Car listing'}</p><h3 className="mt-1 font-semibold text-ink-900">{promotionTitle(r)}</h3></div><span className={progress.tone}>{progress.label}</span></div>
    <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="text-xl text-ink-900">{formatMoney(r.amount)}</strong><span className="text-sm text-ink-500">total · {r.duration_days} days from activation</span></div>
    <p className="mt-3 flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-sm leading-6 text-ink-700">{r.status === 'pending' ? <Clock3 className="mt-1 h-4 w-4 shrink-0" /> : r.status === 'awaiting_payment' ? <CreditCard className="mt-1 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" />}{progress.help}</p>
    <p className="mt-2 text-xs text-ink-500">Requested {formatDateTime(r.created_at)}</p>
    {r.starts_at && <p className="mt-1 text-xs text-ink-500">Started {formatDateTime(r.starts_at)}</p>}
    {r.expires_at && <p className="mt-1 text-xs font-medium text-ink-700">Ends {formatDateTime(r.expires_at)}</p>}
    {r.admin_note && <div className="mt-3 rounded-lg border border-ink-200 p-3 text-sm"><p className="font-semibold">Message from admin</p><p className="mt-1 whitespace-pre-wrap break-words text-ink-600">{r.admin_note}</p></div>}
    {r.status === 'awaiting_payment' && <div className="mt-4 space-y-3 border-t border-ink-100 pt-4">
      {paused && <p role="status" className="rounded-lg border border-amber-300 p-3 text-sm text-ink-700">New promotions are paused. Contact support before paying. If you have already paid, you can still submit your reference below so admin can trace it.</p>}
      <h4 className="font-semibold">1. Pay {formatMoney(r.amount)} via {r.payment_method}</h4>
      <p className="whitespace-pre-wrap break-words rounded-xl bg-ink-50 p-3 text-sm leading-6 text-ink-700">{r.payment_instructions}</p>
      <details className="rounded-lg border border-ink-200 p-3 text-sm"><summary className="cursor-pointer font-medium">Read the terms for this payment</summary><p className="mt-2 whitespace-pre-wrap break-words text-ink-600">{r.terms}</p></details>
      <label className="block text-sm font-semibold">2. Enter your payment reference<input className="input mt-2" maxLength={120} value={reference} onChange={e => setReference(e.target.value)} placeholder="Transaction code from your payment receipt" disabled={busy} /></label>
      <p className="text-xs leading-5 text-ink-500">For example, the transaction code in your payment confirmation. Never enter your PIN, password or full card details.</p>
      <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-ink-600"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)} />I have paid {formatMoney(r.amount)} and agree to the promotion terms above.</label>
      <button type="button" className="btn-primary w-full sm:w-auto" disabled={busy || !accepted || reference.trim().length < 3} onClick={() => void act()}>{busy ? 'Submitting…' : '3. Send payment reference to admin'}</button>
      <p className="text-xs text-ink-500">Your {r.duration_days} days start after admin confirms payment—not while you wait.</p>
      <button type="button" disabled={busy} className="btn-ghost text-xs" onClick={() => setCancel(true)}>Cancel this request · only if you have not paid</button>
    </div>}
    {r.payment_reference && <p className="mt-3 break-words text-xs text-ink-600">Submitted payment reference: <strong>{r.payment_reference}</strong></p>}
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    <Link to="/contact?topic=promotion" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline">Need help with this promotion?</Link>
    {cancel && <ConfirmDialog title="Cancel unpaid request?" message="Cancel only if you have not paid. If you have paid, submit your reference or contact support so your payment can be traced." confirmLabel="Cancel unpaid request" onConfirm={() => act(true)} onClose={() => { if (!lock.current) setCancel(false); }} />}
  </article>;
}
