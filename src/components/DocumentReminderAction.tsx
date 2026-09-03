import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from './useToast';
export function DocumentReminderAction({ source }: { source: string }) {
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const send = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_send_document_reminder', { p_source: source, p_email: email });
    setBusy(false); toast(error ? error.message : data, error ? 'error' : 'success');
  };
  return <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" className="btn-secondary px-3 py-1.5 text-xs" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Send reminder'}</button><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} />Also send email</label></div>;
}
