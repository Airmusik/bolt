import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Mail, MapPin, Paperclip, Phone, Send } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/components/useToast';
import { BackButton } from '@/components/BackButton';
import { SiteLogo } from '@/components/SiteLogo';
import { useSiteSettings } from '@/lib/siteSettings';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import type { ContactMessage, ContactMessageEntry } from '@/lib/types';
import { SupportReceipt } from '@/components/SupportReceipt';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import { cn, formatDateTime } from '@/lib/utils';
import { openContactAttachment, uploadContactAttachment } from '@/lib/contactAttachments';
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea';
import { supportInboxPath } from '@/lib/supportInbox';
import { mergeSupportHistory } from '@/lib/supportHistory';

const CONTACT_FILE_ACCEPT = 'image/*,.heic,.heif,.pdf,.txt,.doc,.docx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function ContactPage() {
  const { user, profile, loading } = useAuth();
  const [searchParams] = useSearchParams();
  if (loading || (user && !profile)) return <div className="container-content py-6" role="status">Loading messages…</div>;
  if (user) return <Navigate replace to={profile?.role === 'admin' ? `/admin?tab=contact${searchParams.get('message') ? `&message=${encodeURIComponent(searchParams.get('message')!)}` : ''}` : supportInboxPath(searchParams)} />;
  return <SupportMessagesPage />;
}

export function SupportMessagesPage({ embedded = false }: { embedded?: boolean }) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ name: profile?.full_name || '', email: user?.email || '', message: searchParams.get('topic') === 'listing-limit' ? 'Hello, I would like to request permission to list more than my current car allowance. Number of cars I would like to list: ' : searchParams.get('topic') === 'account-standing' ? 'Hello, I would like help understanding my rating or a warning on my account. Details: ' : '' });
  const [attachment, setAttachment] = useState<File | null>(null);
  const [threads, setThreads] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(Boolean(user));
  const [reply, setReply] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [replying, setReplying] = useState(false);
  const submissionInFlight = useRef(false);
  const newFileRef = useRef<HTMLInputElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousLastEntry = useRef<string | null>(null);
  const appliedTopic = useRef<string | null>(null);
  const { settings } = useSiteSettings();
  const activeId = searchParams.get('message');
  const active = threads.find((thread) => thread.id === activeId) || threads[0] || null;
  const history = mergeSupportHistory(threads);
  const lastEntryId = history[history.length - 1]?.id;

  useEffect(() => {
    if (!lastEntryId || lastEntryId === previousLastEntry.current) return;
    if (nearBottom.current || !previousLastEntry.current) historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight });
    previousLastEntry.current = lastEntryId;
  }, [lastEntryId]);
  useEffect(() => {
    const topic = searchParams.get('topic');
    if (active && topic && appliedTopic.current !== topic && form.message) {
      appliedTopic.current = topic;
      setReply(form.message);
    }
  }, [active, searchParams, form.message]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      name: current.name || profile?.full_name || '',
      email: current.email || user?.email || '',
    }));
  }, [profile?.full_name, user?.email]);

  const loadThreads = useCallback(async () => {
    if (!user) { setThreads([]); setLoadingThreads(false); return; }
    const { data, error } = await supabase
      .from('contact_messages')
      .select(`*, entries:contact_message_entries(*, sender:profiles!contact_message_entries_sender_id_fkey(${PUBLIC_PROFILE_FIELDS}))`)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) {
      toast('Could not load your support messages: ' + error.message, 'error');
    } else {
      const next = ((data as ContactMessage[]) || []).map((thread) => ({
        ...thread,
        message: [...(thread.entries || [])].filter(entry => !entry.unsent_at).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map(entry => entry.body || entry.attachment_name || '')[0] || '',
        entries: [...(thread.entries || [])].filter(entry => !entry.unsent_at).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
      }));
      setThreads(next);
    }
    setLoadingThreads(false);
  }, [user, toast]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`contact-thread-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages', filter: `user_id=eq.${user.id}` }, () => void loadThreads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_message_entries' }, () => void loadThreads())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, loadThreads]);

  const addAttachmentEntry = async (threadId: string, file: File, senderRole: 'user') => {
    if (!user) throw new Error('Sign in to attach files and keep message history.');
    const uploaded = await uploadContactAttachment(threadId, user.id, file);
    const { error } = await supabase.from('contact_message_entries').insert({
      contact_message_id: threadId,
      sender_id: user.id,
      sender_role: senderRole,
      body: null,
      attachment_path: uploaded.path,
      attachment_name: uploaded.name,
      attachment_type: uploaded.type,
      attachment_size: uploaded.size,
    });
    if (error) throw error;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setLoading(true);
    try {
    const payload = {
      user_id: user?.id || null,
      name: user ? profile?.full_name || form.name.trim() : form.name.trim(),
      email: user ? user.email || form.email.trim().toLowerCase() : form.email.trim().toLowerCase(),
      message: form.message.trim(),
    };
    let threadId: string | null = null;
    let submitError: { message: string } | null = null;
    if (user) {
      const result = await supabase.rpc('send_member_support_message', { p_message: payload.message });
      threadId = result.data;
      submitError = result.error;
    } else {
      const result = await supabase.from('contact_messages').insert(payload);
      submitError = result.error;
    }
    if (submitError || (user && !threadId)) {
      setLoading(false);
      toast('Could not send your message. Please use the contact email instead.', 'error');
      return;
    }
    if (attachment && user && threadId) {
      try {
        await addAttachmentEntry(threadId, attachment, 'user');
      } catch (uploadError) {
        toast(`Your message was sent, but the attachment failed: ${uploadError instanceof Error ? uploadError.message : 'Please try again in the thread.'}`, 'error');
      }
    }
    setLoading(false);
    setForm((current) => ({ ...current, message: '' }));
    setAttachment(null);
    if (newFileRef.current) newFileRef.current.value = '';
    toast(user ? 'Message sent. Replies and history will stay here.' : 'Message sent. Support will reply using your email address.');
    if (user && threadId) {
      await loadThreads();
      navigate(supportInboxPath(new URLSearchParams({ message: threadId })), { replace: true });
    }
    } catch (error) { toast(error instanceof Error ? error.message : 'Could not send your message. Please try again.', 'error'); }
    finally { submissionInFlight.current = false; setLoading(false); }
  };

  const sendReply = async () => {
    if (!user || !active || replying || (!reply.trim() && !replyFile)) return;
    setReplying(true);
    try {
      if (reply.trim()) {
        const { error } = await supabase.from('contact_message_entries').insert({
          contact_message_id: active.id,
          sender_id: user.id,
          sender_role: 'user',
          body: reply.trim(),
        });
        if (error) throw error;
      }
      if (replyFile) await addAttachmentEntry(active.id, replyFile, 'user');
      setReply('');
      nearBottom.current = true;
      setReplyFile(null);
      if (replyFileRef.current) replyFileRef.current.value = '';
      await loadThreads();
    } catch (error) {
      toast(`Could not send your reply: ${error instanceof Error ? error.message : 'Please try again.'}`, 'error');
    } finally {
      setReplying(false);
    }
  };

  const openAttachment = async (entry: ContactMessageEntry) => {
    if (!entry.attachment_path) return;
    try { await openContactAttachment(entry.attachment_path); }
    catch (error) { toast(error instanceof Error ? error.message : 'Could not open attachment.', 'error'); }
  };

  return (
    <div className={embedded ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'container-content overflow-x-hidden py-6 sm:py-10'}>
      {threads.map(thread => <SupportReceipt key={thread.id} thread={thread.id} entries={thread.entries || []} active={Boolean(active)} />)}
      {embedded ? <Link to="/chat" className="flex min-h-11 shrink-0 items-center border-b border-ink-100 px-4 text-sm font-semibold text-ink-700">← All messages</Link> : <><BackButton to="/" /><h1 className="mt-4 font-display text-3xl font-bold text-ink-900">Contact support</h1><p className="mt-2 text-ink-600">Send a message to the support team.</p></>}

      <div className={embedded ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'mt-6 grid min-w-0 gap-5 sm:mt-8 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]'}>
        {!embedded && <div className="min-w-0 space-y-5">
          <div className="card space-y-3 p-5">
            <a href={`mailto:${settings.admin_contact_email}`} className="flex min-w-0 items-center gap-3 rounded-xl p-2 transition hover:bg-ink-50"><Mail className="h-5 w-5 shrink-0 text-brand-600" /><div className="min-w-0"><p className="text-sm font-medium text-ink-900">Email</p><p className="break-all text-sm text-ink-500">{settings.admin_contact_email}</p></div></a>
            <a href={`tel:${settings.admin_contact_phone.replace(/\s/g, '')}`} className="flex min-w-0 items-center gap-3 rounded-xl p-2 transition hover:bg-ink-50"><Phone className="h-5 w-5 shrink-0 text-brand-600" /><div className="min-w-0"><p className="text-sm font-medium text-ink-900">Phone</p><p className="break-words text-sm text-ink-500">{settings.admin_contact_phone}</p></div></a>
            <div className="flex min-w-0 items-center gap-3 p-2"><MapPin className="h-5 w-5 shrink-0 text-brand-600" /><div className="min-w-0"><p className="text-sm font-medium text-ink-900">Address</p><p className="text-sm text-ink-500">Nairobi, Kenya</p></div></div>
          </div>

        </div>}

        {user && loadingThreads ? <p role="status" className="p-4 text-sm text-ink-500">Loading your support conversation…</p> : active && user ? (
          <div className={embedded ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'card flex h-[70dvh] min-h-[380px] min-w-0 flex-col overflow-hidden'}>
            <div className="flex shrink-0 items-start gap-3 border-b border-ink-100 p-4"><SiteLogo size={40} /><div className="min-w-0"><h2 className="text-sm font-semibold text-ink-900">Official {settings.site_name} Support</h2><p className="mt-1 text-xs text-ink-500">All your support messages · history is saved</p></div></div>
            <div ref={historyRef} onScroll={() => { const el = historyRef.current; if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} role="region" aria-label="Support message history" tabIndex={0} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-ink-50/50 p-4">
              {history.map((entry) => {
                const mine = entry.sender_role === 'user';
                return <div key={entry.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-brand-600 text-white' : 'bg-white text-ink-900 ring-1 ring-ink-100 dark:bg-[#1d1d20]')}><p className={cn('mb-1 text-[10px] font-bold', mine ? 'text-brand-100' : 'text-violet-600')}>{mine ? 'You' : entry.sender_role === 'admin' ? `Official ${settings.site_name} Support` : entry.sender?.full_name || 'Guest'}</p>{entry.body && <p className="whitespace-pre-wrap break-words">{entry.body}</p>}{entry.attachment_path && <button type="button" onClick={() => void openAttachment(entry)} className={cn('mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold', mine ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-700')}><FileText className="h-4 w-4" /><span className="min-w-0 truncate">{entry.attachment_name || 'Open attachment'}</span></button>}<p className={cn('mt-1 text-[10px]', mine ? 'text-brand-100' : 'text-ink-400')}>{formatDateTime(entry.created_at)}{mine && !entry.unsent_at && <span> · {entry.read_at ? 'Read' : entry.delivered_at ? 'Delivered' : 'Sent'}</span>}</p></div></div>;
              })}
            </div>
            <div className="shrink-0 border-t border-ink-100 p-3">
              {replyFile && <div className="mb-2 flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800"><span className="truncate">{replyFile.name}</span><button type="button" onClick={() => { setReplyFile(null); if (replyFileRef.current) replyFileRef.current.value = ''; }} className="font-bold">Remove</button></div>}
              <div className="flex items-end gap-2"><input ref={replyFileRef} type="file" accept={CONTACT_FILE_ACCEPT} className="hidden" onChange={(event) => { setReplyFile(event.target.files?.[0] || null); }} /><button type="button" onClick={() => replyFileRef.current?.click()} className="mb-0.5 rounded-full p-2 text-ink-500 hover:bg-ink-100" aria-label="Attach a file"><Paperclip className="h-5 w-5" /></button><AutoGrowTextarea value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendReply(); } }} className="input min-h-10 min-w-0 flex-1 py-2.5" aria-label="Reply to support" placeholder="Reply to support…" maxLength={5000} /><button type="button" onClick={() => void sendReply()} disabled={replying || (!reply.trim() && !replyFile)} className="btn-primary mb-0.5 px-3" aria-label="Send reply">{replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
              <p className="mt-2 text-[11px] text-ink-400">Images, PDF, text, or Word files · maximum 8 MB · kept privately with this conversation</p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className={embedded ? 'min-h-0 w-full flex-1 overflow-y-auto p-4 sm:p-6' : 'card min-w-0 self-start p-4 sm:p-6'}>
            <h2 className="font-display text-xl font-bold text-ink-900">Start a message</h2>
            <p className="mt-1 text-xs text-ink-500">{user ? 'Your message, attachments, and all support replies will remain in your history.' : 'Sign in if you want attachments and in-app reply history. Support uses the supplied email address for guest responses.'}</p>
            <div className="mt-5"><label className="label">Name <span className="text-danger">*</span></label><input value={user ? profile?.full_name || form.name : form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="input" required readOnly={Boolean(user)} /><p className="mt-1.5 text-xs text-ink-400">{user ? 'Your registered account name is used so support can identify you correctly.' : 'Tell support what name to use when replying.'}</p></div>
            <div className="mt-4"><label className="label">Email <span className="text-danger">*</span></label><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="input" required readOnly={Boolean(user?.email)} /><p className="mt-1.5 text-xs text-ink-400">Support notifications and replies are associated with this address.</p></div>
            <div className="mt-4"><label className="label">Message <span className="text-danger">*</span></label><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={5} className="input" required minLength={5} maxLength={5000} /><p className="mt-1.5 text-xs text-ink-400">Describe what happened, what you expected, and the help you need.</p></div>
            {user && <div className="mt-4"><input ref={newFileRef} type="file" accept={CONTACT_FILE_ACCEPT} className="block w-full rounded-xl border border-ink-200 bg-white text-xs text-ink-600 file:mr-3 file:border-0 file:border-r file:border-ink-200 file:bg-ink-50 file:px-4 file:py-3 file:font-semibold dark:bg-[#141416]" onChange={(event) => setAttachment(event.target.files?.[0] || null)} /><p className="mt-1.5 text-xs text-ink-400">Optional image, PDF, text, or Word file · maximum 8 MB.</p></div>}
            <button type="submit" disabled={loading} className="btn-primary mt-5 w-full">{loading ? 'Sending…' : 'Send message'} <Send className="h-4 w-4" /></button>
          </form>
        )}
      </div>
    </div>
  );
}
