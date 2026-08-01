import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Send, Image as ImageIcon, ArrowLeft, Check, CheckCheck, Smile, Flag, Ban } from 'lucide-react';
import { supabase, VEHICLE_BUCKET } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/Toast';
import type { Conversation, Message, Profile } from '@/lib/types';
import { Avatar } from '@/components/Avatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { EmptyState } from '@/components/EmptyState';
import { ReportModal } from './VehicleDetailsPage';
import { cn, timeAgo } from '@/lib/utils';

const EMOJIS = ['😀', '😂', '👍', '🙏', '🔥', '💪', '🚗', '✅', '❤️', '😎'];

export function ChatPage() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<(Conversation & { vehicle?: any; driver?: Profile; owner?: Profile })[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [otherTyping, setOtherTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select('*, vehicle:vehicles(*, photos:vehicle_photos(*)), driver:profiles!conversations_driver_id_fkey(*), owner:profiles!conversations_owner_id_fkey(*)')
      .or(`driver_id.eq.${user.id},owner_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setConversations((data as any) || []);
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
  }, [conversationId, conversations]);

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
          setMessages((prev) => [...prev, m]);
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

  const send = async (content?: string, type: 'text' | 'image' = 'text') => {
    if (!user || !active) return;
    const body = content ?? text.trim();
    if (!body) return;
    const { data } = await supabase.from('messages').insert({
      conversation_id: active.id, sender_id: user.id, content: body, type,
    }).select().maybeSingle();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', active.id);
      // notify other party
      const otherId = user.id === active.driver_id ? active.owner_id : active.driver_id;
      await supabase.from('notifications').insert({
        user_id: otherId, type: 'message', title: 'New message',
        body: 'You have a new message on GariLink', data: { conversation_id: active.id },
      });
    }
    setText('');
    setShowEmoji(false);
    loadConversations();
  };

  const sendImage = async (file: File) => {
    if (!user) return;
    const ext = file.name.split('.').pop();
    const path = `${user.id}/chat-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(VEHICLE_BUCKET).upload(path, file);
    if (error) { toast('Upload failed', 'error'); return; }
    const { data: pub } = supabase.storage.from(VEHICLE_BUCKET).getPublicUrl(path);
    send(pub.publicUrl, 'image');
  };

  const blockUser = async () => {
    if (!user || !active) return;
    const otherId = user.id === active.driver_id ? active.owner_id : active.driver_id;
    await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: otherId });
    toast('User blocked.');
  };

  if (loading) return <div className="container-content py-8"><div className="card h-96 animate-pulse" /></div>;

  if (conversations.length === 0) {
    return (
      <div className="container-content py-12">
        <EmptyState title="No conversations yet" description="Chats open automatically once an owner accepts your application." action={<Link to="/browse-cars" className="btn-primary">Browse cars</Link>} />
      </div>
    );
  }

  const other = active ? (user?.id === active.driver_id ? active.owner : active.driver) : null;

  return (
    <div className="container-content py-6">
      <h1 className="mb-4 font-display text-2xl font-bold text-ink-900">Messages</h1>
      <div className="grid h-[70vh] gap-4 lg:grid-cols-[300px_1fr]">
        {/* Conversation list */}
        <div className={cn('card overflow-y-auto', active && 'hidden lg:block')}>
          {conversations.map((c) => {
            const otherUser = user?.id === c.driver_id ? c.owner : c.driver;
            return (
              <button key={c.id} onClick={() => setActive(c)} className={cn('flex w-full items-center gap-3 border-b border-ink-50 p-3 text-left hover:bg-ink-50', active?.id === c.id && 'bg-brand-50')}>
                <Avatar name={otherUser?.full_name || 'User'} src={otherUser?.avatar_url} size={44} verified={!!otherUser?.is_verified} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900">
                    {otherUser?.full_name} <VerifiedBadge verified={otherUser?.is_verified} size={11} />
                  </p>
                  <p className="truncate text-xs text-ink-500">{c.vehicle?.make} {c.vehicle?.model}</p>
                </div>
                {c.last_message_at && <span className="text-[10px] text-ink-400">{timeAgo(c.last_message_at)}</span>}
              </button>
            );
          })}
        </div>

        {/* Chat window */}
        <div className={cn('card flex flex-col overflow-hidden', !active && 'hidden lg:flex')}>
          {active && other ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-ink-100 p-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setActive(null)} className="lg:hidden"><ArrowLeft className="h-5 w-5 text-ink-500" /></button>
                  <Avatar name={other.full_name} src={other.avatar_url} size={40} verified={other.is_verified} />
                  <div>
                    <p className="flex items-center gap-1 font-semibold text-ink-900">{other.full_name} <VerifiedBadge verified={other.is_verified} size={12} /></p>
                    <p className="text-xs text-brand-600">{otherTyping ? 'typing…' : 'online'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setShowReport(true)} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Flag className="h-4 w-4" /></button>
                  <button onClick={blockUser} className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-danger"><Ban className="h-4 w-4" /></button>
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-ink-50/50 p-4">
                {messages.map((m) => {
                  const mine = m.sender_id === user?.id;
                  return (
                    <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[75%] rounded-2xl px-3 py-2 text-sm', mine ? 'bg-brand-600 text-white' : 'bg-white text-ink-900 ring-1 ring-ink-100')}>
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
                  );
                })}
              </div>

              {/* Emoji picker */}
              {showEmoji && (
                <div className="flex flex-wrap gap-1 border-t border-ink-100 p-2">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { setText((t) => t + e); }} className="rounded-lg p-1.5 text-lg hover:bg-ink-100">{e}</button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div className="flex items-center gap-2 border-t border-ink-100 p-3">
                <button onClick={() => setShowEmoji((v) => !v)} className="rounded-full p-2 text-ink-400 hover:bg-ink-100"><Smile className="h-5 w-5" /></button>
                <button onClick={() => fileRef.current?.click()} className="rounded-full p-2 text-ink-400 hover:bg-ink-100"><ImageIcon className="h-5 w-5" /></button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ''; }} />
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message…"
                  className="input flex-1"
                  autoFocus
                />
                <button onClick={() => send()} disabled={!text.trim()} className="btn-primary px-3"><Send className="h-4 w-4" /></button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-ink-400">
              <p className="text-sm">Select a conversation to start chatting.</p>
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
