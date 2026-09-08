import { useMemo, useState } from 'react';
import { Mail, Megaphone, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './useToast';

type Audience = 'all' | 'driver' | 'owner';

export function AdminMemberUpdates({ users }: { users: Profile[] }) {
  const { toast } = useToast();
  const [audience, setAudience] = useState<Audience>('all');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const eligible = useMemo(() => users.filter((member) => member.role !== 'admin' && !member.is_suspended && (audience === 'all' || member.role === audience)), [users, audience]);
  const emailCount = eligible.filter((member) => member.email && member.email_confirmed).length;
  const valid = title.trim().length >= 3 && body.trim().length >= 5;

  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.rpc('admin_send_member_update', {
      p_audience: audience, p_title: title.trim(), p_body: body.trim(), p_email: email,
    });
    setSending(false);
    if (error) { toast(`Could not send update: ${error.message}`, 'error'); return; }
    setTitle(''); setBody('');
    toast(`Update sent to ${Number(data)} member${Number(data) === 1 ? '' : 's'}${email ? '; confirmed addresses were also emailed' : ''}.`);
  };

  return <div className="card p-5">
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Megaphone className="h-5 w-5" /></span>
      <div><h2 className="font-display text-lg font-bold text-ink-900">Send a member update</h2><p className="mt-1 text-sm text-ink-500">Send an operational announcement to member notifications and, optionally, confirmed email addresses.</p></div>
    </div>
    <div className="mt-5 grid gap-4">
      <div><label className="label" htmlFor="update-audience">Audience</label><select id="update-audience" className="input" value={audience} onChange={(event) => setAudience(event.target.value as Audience)}><option value="all">All active members</option><option value="driver">Drivers only</option><option value="owner">Car owners only</option></select></div>
      <div><label className="label" htmlFor="update-title">Notification title</label><input id="update-title" className="input" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Scheduled maintenance" /><p className="mt-1 text-right text-xs text-ink-400">{title.length}/80</p></div>
      <div><label className="label" htmlFor="update-message">Message</label><textarea id="update-message" className="input min-h-32" maxLength={1000} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a clear, useful update for members…" /><p className="mt-1 text-right text-xs text-ink-400">{body.length}/1000</p></div>
      <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
        <p className="text-sm font-semibold text-ink-800">Delivery</p>
        <p className="mt-1 text-xs text-ink-500">All {eligible.length} selected members will receive an in-app notification.</p>
        <label className="mt-3 flex cursor-pointer items-start gap-3 text-sm text-ink-700"><input type="checkbox" checked={email} onChange={(event) => setEmail(event.target.checked)} className="mt-0.5 h-4 w-4 accent-accent-600" /><span><span className="flex items-center gap-1.5 font-medium"><Mail className="h-4 w-4" /> Also send by email</span><span className="mt-0.5 block text-xs text-ink-500">{emailCount} selected members currently have confirmed email addresses.</span></span></label>
      </div>
      <div><button className="btn-primary" disabled={!valid || eligible.length === 0 || sending} onClick={() => setConfirming(true)}><Send className="h-4 w-4" /> Review and send</button></div>
    </div>
    {confirming && <ConfirmDialog title="Send member update?" message={`This will send an in-app notification to ${eligible.length} active ${audience === 'all' ? 'members' : audience === 'driver' ? 'drivers' : 'car owners'}${email ? ` and email ${emailCount} confirmed addresses` : ''}. Sent notifications cannot be recalled.`} confirmLabel={sending ? 'Sending…' : 'Send update'} onConfirm={send} onClose={() => { if (!sending) setConfirming(false); }} />}
  </div>;
}
