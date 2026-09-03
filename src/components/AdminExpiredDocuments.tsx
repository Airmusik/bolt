import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, MessageSquare, RotateCcw, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useToast } from './useToast';
import { ConfirmDialog } from './ConfirmDialog';
import { DocumentExpiry } from './DocumentExpiry';
import { DocumentScanner } from './DocumentScanner';

type ExpiredItem = { source_key: string; user_id: string; vehicle_id: string | null; full_name: string; role: string; label: string; expires_at: string; review_status: string; visibility: 'public' | 'private' | 'deleted' };
type EmailStatus = { enabled: boolean; queued: number; accepted: number; failed: number };

export function AdminExpiredDocuments({ onContact, onChanged }: { onContact: (id: string) => void; onChanged: () => void | Promise<void> }) {
  const { toast } = useToast();
  const [items, setItems] = useState<ExpiredItem[]>([]);
  const [email, setEmail] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState<{ item: ExpiredItem; kind: 'private' | 'deleted' | 'public' } | null>(null);
  const load = useCallback(async () => {
    const [docs, mail] = await Promise.all([supabase.rpc('admin_expired_documents'), supabase.rpc('admin_document_email_status')]);
    if (docs.error || mail.error) setError(docs.error?.message || mail.error?.message || 'Could not load expiry information');
    else { setItems(docs.data || []); setEmail(mail.data); setError(''); }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const applyAction = async () => {
    if (!action) return;
    const { error: failure } = await supabase.rpc('admin_document_listing_action', { p_user_id: action.item.user_id, p_vehicle_id: action.item.vehicle_id, p_action: action.kind });
    if (failure) { toast(failure.message, 'error'); return; }
    toast('Listing visibility updated. The member was notified.');
    setAction(null);
    await load();
    await onChanged();
  };
  return <div className="space-y-4">
    <DocumentScanner />
    <div className="card p-4 sm:p-5"><h2 className="font-display text-lg font-bold text-ink-900">Expired documents & listing visibility</h2><p className="mt-1 text-sm text-ink-600">Review expired platform history and existing non-KYC evidence. Contact the member, make their listing private, or remove it from discovery. Accounts and saved chats are not deleted.</p><p className="mt-2 text-xs text-ink-500">No owner identity, logbook or inspection document requirement is added. Owners without document requirements are not flagged.</p></div>
    {email && <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 text-sm text-ink-700"><p className="font-semibold">Reminders: 30, 7, and 1 day before expiry, plus expiry day</p><p className="mt-1">In-app reminders run automatically. {email.enabled ? 'Email delivery is enabled.' : 'Email delivery needs setup: configure a sending service and verified sender. No reminder email has been sent while disabled.'}</p><p className="mt-2 text-xs">Email queue: {email.queued} · Accepted by email provider: {email.accepted} · Needs attention: {email.failed}</p></div>}
    {error && <div className="card p-4 text-sm text-danger">{error}<button onClick={() => void load()} className="btn-secondary ml-3">Retry</button></div>}
    {loading ? <p className="text-sm text-ink-500">Loading expired documents…</p> : !error && !items.length ? <div className="card p-6 text-sm text-ink-600">No expired documents or document-restricted listings.</div> : items.map(item => <div key={item.source_key} className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-ink-900"><a href={`/members/${item.user_id}`} className="hover:underline">{item.full_name}</a></h3><span className="badge badge-warning capitalize">{item.visibility === 'deleted' ? 'Removed from discovery' : item.visibility}</span></div>
      <p className="mt-1 text-sm text-ink-600">{item.role === 'owner' ? 'Car owner' : 'Driver'} · {item.label}</p>
      <DocumentExpiry expiresAt={item.expires_at} />
      {item.review_status === 'pending' && <p className="mt-2 text-sm font-semibold text-brand-700">Renewal submitted — awaiting admin review.</p>}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <button className="btn-secondary" onClick={() => onContact(item.user_id)}><MessageSquare className="h-4 w-4" /> Contact user</button>
        <a className="btn-secondary" href={item.vehicle_id ? `/vehicles/${item.vehicle_id}` : `/members/${item.user_id}`}><Eye className="h-4 w-4" /> View listing</a>
        {(item.vehicle_id || item.role === 'driver') && <>
          {item.visibility === 'public' && <button className="btn-secondary" onClick={() => setAction({ item, kind: 'private' })}><EyeOff className="h-4 w-4" /> Make private</button>}
          {item.visibility !== 'deleted' && <button className="btn-secondary text-danger" onClick={() => setAction({ item, kind: 'deleted' })}><Trash2 className="h-4 w-4" /> Remove listing</button>}
          {item.visibility !== 'public' && <button className="btn-secondary" onClick={() => setAction({ item, kind: 'public' })}><RotateCcw className="h-4 w-4" /> Restore after renewal</button>}
        </>}
      </div>
    </div>)}
    {action && <ConfirmDialog title={action.kind === 'public' ? 'Restore listing?' : action.kind === 'private' ? 'Make listing private?' : 'Remove listing?'} message={action.kind === 'public' ? 'The listing will be publicly visible again once current approved evidence is confirmed.' : 'The listing will no longer appear to other members. The user will be notified. Their account, documents and chat history remain saved; this does not end active connections.'} confirmLabel={action.kind === 'public' ? 'Restore' : action.kind === 'private' ? 'Make private' : 'Remove listing'} danger={action.kind === 'deleted'} onClose={() => setAction(null)} onConfirm={applyAction} />}
  </div>;
}
