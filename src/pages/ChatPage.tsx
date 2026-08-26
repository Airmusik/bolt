import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Send, ArrowLeft, Check, CheckCheck, Smile, Flag, Ban, MessageCircle, Sparkles, CarFront } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useToast } from '@/components/useToast';
import type { Conversation, Message, Profile, VehicleWithRelations } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { ReportModal } from './VehicleDetailsPage';
import { cn, timeAgo } from '@/lib/utils';
import { PUBLIC_PROFILE_FIELDS } from '@/lib/profileSelect';
import { useSiteSettings } from '@/lib/siteSettings';

const EMOJIS = ['😀', '😂', '👍', '🙏', '🔥', '💪', '🚗', '✅', '❤️', '😎'];

export function ChatPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();
  const { settings } = useSiteSettings();

  const [conversations, setConversations] = useState<(Conversation & { vehicle?: VehicleWithRelations; driver?: Profile; owner?: Profile })[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select(`*, vehicle:vehicles(*, photos:vehicle_photos(*)), driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), admin:profiles!conversations_admin_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
      .or(`driver_id.eq.${user.id},owner_id.eq.${user.id},admin_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setConversations((data as (Conversation & { vehicle?: VehicleWithRelations; driver?: Profile; owner?: Profile })[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (conversationId && conversations.length > 0) {
      const c = conversations.find((x) => x.id === conversationId);
      if (c) setActive(c);
    } else if (!conversationId && conversations.length > 0 && !active) {
      // keep none selected on mobile until clicked
    }
  }, [conversationId, conversations, active]);

  const loadMessages = useCallback(async () => {
    if (!active) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', active.id)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    // mark incoming as read
    if (user) {
      await supabase.from('messages').update({ read: true }).eq('conversation_id', active.id).neq('sender_id', user.id).eq('read', false);
    }
  }, [active, user]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('chat-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message;
        if (active && m.conversation_id === active.id) {
          setMessages((prev) => prev.some((item) => item.id === m.id) ? prev : [...prev, m]);
          if (m.sender_id !== user.id) {
            supabase.from('messages').update({ read: true }).eq('id', m.id);
          }
        }
        loadConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => prev.map((x) => x.id === m.id ? m : x));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, active, loadConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const send = async () => {
    if (!user || !active) return;
    const body = text.trim();
    if (!body) return;
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: active.id, sender_id: user.id, content: body, type: 'text',
    }).select().maybeSingle();
    if (error) {
      toast('Could not send message: ' + error.message, 'error');
      return;
    }
    if (data) {
      setMessages((prev) => prev.some((item) => item.id === data.id) ? prev : [...prev, data as Message]);
    }
    setText('');
    setShowEmoji(false);
    loadConversations();
  };

  const blockUser = async () => {
    if (!user || !active) return;
    const otherId = user.id === active.driver_id ? active.owner_id : active.driver_id;
    if (!otherId) { toast('Could not identify this user.', 'error'); return; }
    const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: otherId });
    if (error) { toast('Could not block user: ' + error.message, 'error'); return; }
    toast('User blocked.');
    setActive(null);
  };

  if (loading) return <div className="container-content py-8"><div className="card h-96 animate-pulse" /></div>;

  if (conversations.length === 0) {
    return (
      <div className="container-content py-12">
        <EmptyState title="No conversations yet" description="Chats open automatically once an owner accepts your application." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />
      </div>
    );
  }

  const other = active ? (user?.id === active.driver_id ? (active.owner || active.admin) : user?.id === active.owner_id ? (active.driver || active.admin) : active.driver || active.owner) : null;

  return (
    <div className="container-content py-6">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Your connections</p><h1 className="font-display text-2xl font-bold text-ink-900">Messages</h1></div>
        <span className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 sm:inline-flex"><Sparkles className="h-3.5 w-3.5" /> Private member chat</span>
      </div>
      <div className="grid h-[72vh] min-h-[540px] gap-4 lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <div className={cn('card overflow-y-auto bg-gradient-to-b from-white to-ink-50/60 dark:from-[#141416] dark:to-[#101012]', active && 'hidden lg:block')}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur dark:bg-[#141416]/90">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-900"><MessageCircle className="h-4 w-4 text-brand-600" /> Conversations</span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">{conversations.length}</span>
          </div>
          {conversations.map((c) => {
            const otherUser = user?.id === c.driver_id ? (c.owner || c.admin) : user?.id === c.owner_id ? (c.driver || c.admin) : (c.driver || c.owner);
            return (
              <button key={c.id} onClick={() => setActive(c)} className={cn('group relative flex w-full items-center gap-3 border-b border-ink-50 p-3 text-left transition hover:bg-brand-50/60', active?.id === c.id && 'bg-brand-50 shadow-[inset_3px_0_0_0_theme(colors.brand.500)] dark:bg-brand-950/25')}>
                <Avatar name={otherUser?.full_name || 'User'} src={otherUser?.avatar_url} size={44} verified={!!otherUser?.is_verified} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900">
                    {otherUser?.full_name} <VerifiedBadge verified={otherUser?.is_verified} size={11} />
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">{c.vehicle?.make && <CarFront className="h-3 w-3 shrink-0" />}{c.vehicle?.make ? `${c.vehicle.make} ${c.vehicle.model}` : c.admin_id ? `${settings.site_name} Admin` : 'Conversation'} </p>
                </div>
                {c.last_message_at && <span className="text-[10px] text-ink-400">{timeAgo(c.last_message_at)}</span>}
              </button>
            );
          })}
        </div>

        {/* Chat window */}
        <div className={cn('card flex flex-col overflow-hidden shadow-card-hover', !active && 'hidden lg:flex')}>
          {active && other ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-brand-100 bg-gradient-to-r from-brand-50 via-white to-violet-50 p-4 dark:from-brand-950/30 dark:via-[#141416] dark:to-violet-950/20">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActive(null)} className="lg:hidden"><ArrowLeft className="h-5 w-5 text-ink-500" /></button>
                  <Avatar name={other.full_name} src={other.avatar_url} size={40} verified={other.is_verified} />
                  <div>
                    <p className="flex items-center gap-1 font-semibold text-ink-900">{other.full_name} <VerifiedBadge verified={other.is_verified} size={12} /></p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">{active.vehicle_id ? <><CarFront className="h-3 w-3" /> Vehicle conversation</> : active.admin_id ? `${settings.site_name} support` : 'Member conversation'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setShowReport(true)} aria-label="Report conversation" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Flag className="h-4 w-4" /></button>
                  <button onClick={blockUser} aria-label="Block user" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-danger"><Ban className="h-4 w-4" /></button>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.08),transparent_36%)] bg-ink-50/50 p-4 sm:p-5">
                {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-brand-100 dark:bg-[#1d1d20]"><Sparkles className="h-6 w-6" /></span><p className="mt-3 text-sm font-semibold text-ink-800">Start the conversation</p><p className="mt-1 max-w-xs text-xs text-ink-500">Keep arrangements in chat so both members have a clear record.</p></div>}
                {messages.map((m, index) => {
                  const mine = m.sender_id === user?.id;
                  const previous = messages[index - 1];
                  const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(m.created_at).toDateString();
                  return (
                    <div key={m.id}>
                      {showDay && <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-ink-100" /><span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold text-ink-400 shadow-sm ring-1 ring-ink-100 dark:bg-[#1d1d20]">{formatChatDay(m.created_at)}</span><span className="h-px flex-1 bg-ink-100" /></div>}
                      <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[72%]', mine ? 'rounded-br-md bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-brand-900/10' : 'rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100 dark:bg-[#1d1d20]')}>
                        {m.type === 'image' ? (
                          <img src={m.content || ''} alt="" className="max-h-48 rounded-lg" />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        )}
                        <div className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine ? 'text-brand-100' : 'text-ink-400')}>
                          {timeAgo(m.created_at)}
                          {mine && (m.read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                        </div>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Emoji picker */}
              {showEmoji && (
                <div className="flex flex-wrap gap-1 border-t border-ink-100 bg-white/95 p-2 shadow-[0_-6px_20px_rgba(0,0,0,0.03)] dark:bg-[#141416]">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { setText((t) => t + e); }} className="rounded-lg p-1.5 text-lg hover:bg-ink-100">{e}</button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex items-center gap-2 border-t border-ink-100 bg-white p-3 dark:bg-[#141416]">
                <button onClick={() => setShowEmoji((v) => !v)} aria-label="Choose emoji" className="rounded-full p-2 text-ink-400 hover:bg-ink-100"><Smile className="h-5 w-5" /></button>
                <div className="relative flex-1"><input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message…"
                  className="input w-full rounded-2xl border-0 bg-ink-50 pr-16 ring-1 ring-ink-100 focus:bg-white focus:ring-brand-300"
                  maxLength={1000}
                  autoFocus
                /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-300">{text.length}/1000</span></div>
                <button onClick={() => send()} disabled={!text.trim()} className="btn-primary h-10 w-10 rounded-full p-0 shadow-lg shadow-brand-600/20" aria-label="Send message"><Send className="h-4 w-4" /></button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-brand-50/70 via-white to-violet-50/70 text-center dark:from-brand-950/20 dark:via-[#141416] dark:to-violet-950/20">
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-brand-600 shadow-card ring-1 ring-brand-100 dark:bg-[#1d1d20]"><MessageCircle className="h-7 w-7" /></span>
              <p className="mt-4 text-sm font-semibold text-ink-800">Choose a conversation</p><p className="mt-1 max-w-xs text-xs text-ink-500">Your vehicle discussions, arrangements, and support messages stay together here.</p>
            </div>
          )}
        </div>
      </div>

      {showReport && active && other && (
        <ReportModal targetType="conversation" targetId={active.id} reportedId={other.id} onClose={() => setShowReport(false)} onDone={() => { setShowReport(false); toast('Conversation reported.'); }} />
      )}
    </div>
  );
}

function formatChatDay(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}
