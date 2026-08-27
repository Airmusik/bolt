import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Check, CheckCheck, Smile, Flag, Ban, MessageCircle, Sparkles, CarFront, LockKeyhole, Headphones } from 'lucide-react';
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
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';

const EMOJIS = ['😀', '😂', '👍', '🙏', '🔥', '💪', '🚗', '✅', '❤️', '😎'];
const ONLINE_WINDOW_MS = 2 * 60 * 1000;

type BlockStatus = {
  i_blocked_other: boolean;
  blocked_by_other: boolean;
};

type ConversationWithRelations = Conversation & {
  vehicle?: VehicleWithRelations;
  driver?: Profile;
  owner?: Profile;
};

type ConversationGroup = {
  key: string;
  items: ConversationWithRelations[];
  latest: ConversationWithRelations;
  activeConversation: ConversationWithRelations;
};

const CLEAR_BLOCK_STATUS: BlockStatus = {
  i_blocked_other: false,
  blocked_by_other: false,
};

function isProfileOnline(member?: Profile | null) {
  if (!member?.last_seen_at) return false;
  return Date.now() - new Date(member.last_seen_at).getTime() < ONLINE_WINDOW_MS;
}

function lastSeenText(member?: Profile | null) {
  if (!member?.last_seen_at) return 'Last seen unavailable';
  if (isProfileOnline(member)) return 'Online';
  return `Last seen ${timeAgo(member.last_seen_at)}`;
}

function conversationActivity(conversation: Conversation) {
  return new Date(conversation.last_message_at || conversation.created_at).getTime();
}

function conversationPartnerId(conversation: Conversation, userId: string) {
  if (userId === conversation.driver_id) return conversation.owner_id || conversation.admin_id;
  if (userId === conversation.owner_id) return conversation.driver_id || conversation.admin_id;
  if (userId === conversation.admin_id) return conversation.driver_id || conversation.owner_id;
  return conversation.driver_id || conversation.owner_id || conversation.admin_id;
}

export function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const { settings } = useSiteSettings();

  const [conversations, setConversations] = useState<ConversationWithRelations[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showSupportRequest, setShowSupportRequest] = useState(false);
  const [supportRequest, setSupportRequest] = useState('');
  const [requestingSupport, setRequestingSupport] = useState(false);
  const [confirmSafetyAction, setConfirmSafetyAction] = useState<'block' | 'unblock' | null>(null);
  const [blockStatus, setBlockStatus] = useState<BlockStatus>(CLEAR_BLOCK_STATUS);
  const [otherTyping, setOtherTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingStopTimerRef = useRef<number | null>(null);
  const remoteTypingTimerRef = useRef<number | null>(null);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('conversations')
      .select(`*, vehicle:vehicles(*, photos:vehicle_photos(*)), connection:connections(status), application:applications(status), driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), admin:profiles!conversations_admin_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
      .or(`driver_id.eq.${user.id},owner_id.eq.${user.id},admin_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    const sorted = ((data as ConversationWithRelations[]) || []).sort((a, b) => conversationActivity(b) - conversationActivity(a));
    setConversations(sorted);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const conversationGroups = useMemo<ConversationGroup[]>(() => {
    if (!user) return [];
    const grouped = new Map<string, ConversationWithRelations[]>();
    conversations.forEach((conversation) => {
      const partnerId = conversationPartnerId(conversation, user.id);
      const key = partnerId ? `member:${partnerId}` : `conversation:${conversation.id}`;
      const existing = grouped.get(key) || [];
      existing.push(conversation);
      grouped.set(key, existing);
    });
    return [...grouped.entries()]
      .map(([key, items]) => {
        const ordered = [...items].sort((a, b) => conversationActivity(b) - conversationActivity(a));
        return {
          key,
          items: ordered,
          latest: ordered[0],
          activeConversation: ordered.find((conversation) => !conversation.closed_at) || ordered[0],
        };
      })
      .sort((a, b) => conversationActivity(b.latest) - conversationActivity(a.latest));
  }, [conversations, user]);

  const activeGroup = useMemo(() => {
    if (!active || !user) return null;
    const key = conversationPartnerId(active, user.id);
    return conversationGroups.find((group) => group.key === (key ? `member:${key}` : `conversation:${active.id}`)) || null;
  }, [active, conversationGroups, user]);

  const activeConversationIds = useMemo(
    () => activeGroup?.items.map((conversation) => conversation.id) || [],
    [activeGroup],
  );

  const typingTopic = useMemo(() => {
    if (!active || !user) return null;
    const participants = [active.driver_id, active.owner_id, active.admin_id]
      .filter((id): id is string => Boolean(id))
      .sort();
    return participants.length > 1 ? `chat-typing:${participants.join(':')}` : null;
  }, [active, user]);

  useEffect(() => {
    if (conversationId && conversations.length > 0) {
      const c = conversations.find((x) => x.id === conversationId);
      if (c && user) {
        const partnerId = conversationPartnerId(c, user.id);
        const group = conversationGroups.find((item) => item.key === (partnerId ? `member:${partnerId}` : `conversation:${c.id}`));
        setActive(group?.activeConversation || c);
      }
    } else if (!conversationId && conversations.length > 0 && !active) {
      // keep none selected on mobile until clicked
    }
  }, [conversationId, conversations, conversationGroups, active, user]);

  const loadMessages = useCallback(async () => {
    if (!active || activeConversationIds.length === 0) return;
    const { data } = await supabase
      .from('messages')
      .select(`*, sender:profiles!messages_sender_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
      .in('conversation_id', activeConversationIds)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    // mark incoming as read
    if (user) {
      await supabase.from('messages').update({ read: true }).in('conversation_id', activeConversationIds).neq('sender_id', user.id).eq('read', false);
    }
  }, [active, activeConversationIds, user]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const loadBlockStatus = useCallback(async () => {
    if (!active || !user || (user.id !== active.driver_id && user.id !== active.owner_id)) {
      setBlockStatus(CLEAR_BLOCK_STATUS);
      return;
    }
    const { data, error } = await supabase.rpc('get_conversation_block_status', {
      p_conversation_id: active.id,
    });
    if (error) {
      setBlockStatus(CLEAR_BLOCK_STATUS);
      return;
    }
    const status = data?.[0] as BlockStatus | undefined;
    setBlockStatus(status || CLEAR_BLOCK_STATUS);
  }, [active, user]);

  useEffect(() => {
    loadBlockStatus();
  }, [loadBlockStatus]);

  useEffect(() => {
    setOtherTyping(false);
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    if (remoteTypingTimerRef.current) window.clearTimeout(remoteTypingTimerRef.current);
    if (!typingTopic || !user) return;

    const channel = supabase
      .channel(typingTopic, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.user_id === user.id) return;
        const isTyping = payload.is_typing === true;
        setOtherTyping(isTyping);
        if (remoteTypingTimerRef.current) window.clearTimeout(remoteTypingTimerRef.current);
        if (isTyping) {
          remoteTypingTimerRef.current = window.setTimeout(() => setOtherTyping(false), 2500);
        }
      })
      .subscribe();
    typingChannelRef.current = channel;

    return () => {
      if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
      if (remoteTypingTimerRef.current) window.clearTimeout(remoteTypingTimerRef.current);
      if (typingChannelRef.current === channel) typingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [typingTopic, user]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!user || !typingChannelRef.current) return;
    void typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id, is_typing: isTyping },
    });
    if (typingStopTimerRef.current) window.clearTimeout(typingStopTimerRef.current);
    if (isTyping) {
      typingStopTimerRef.current = window.setTimeout(() => {
        if (!typingChannelRef.current) return;
        void typingChannelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: user.id, is_typing: false },
        });
      }, 1200);
    }
  }, [user]);

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    const refreshed = conversations.find((conversation) => conversation.id === activeId);
    if (refreshed) setActive(refreshed);
  }, [activeId, conversations]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      loadConversations();
      if (activeId) loadMessages();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [activeId, loadConversations, loadMessages]);

  // realtime subscriptions
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`chat-realtime:${user.id}:${active?.id || 'list'}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const m = payload.new as Message;
        if (active && activeConversationIds.includes(m.conversation_id)) {
          loadMessages();
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
  }, [user, active, activeConversationIds, loadConversations, loadMessages]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const send = async () => {
    if (!user || !active) return;
    if (active.closed_at) { toast('This connection has ended. The chat is saved as read-only history.', 'error'); return; }
    if (blockStatus.i_blocked_other) { toast('Unblock this member before sending a message.', 'error'); return; }
    if (blockStatus.blocked_by_other) { toast('This member has blocked messaging with you.', 'error'); return; }
    const body = text.trim();
    if (!body) return;
    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversation_id: active.id,
      sender_id: user.id,
      content: body,
      type: 'text',
      read: false,
      created_at: new Date().toISOString(),
      sender: profile || undefined,
    };
    setMessages((current) => [...current, optimisticMessage]);
    setText('');
    setShowEmoji(false);
    broadcastTyping(false);

    const { data, error } = await supabase.rpc('send_message', {
      p_conversation_id: active.id,
      p_content: body,
    });
    if (error) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setText(body);
      toast('Could not send message: ' + error.message, 'error');
      return;
    }
    const savedMessage = (Array.isArray(data) ? data[0] : data) as Message | null;
    if (savedMessage) {
      setMessages((current) => current.map((message) => message.id === optimisticId ? { ...savedMessage, sender: profile || undefined } : message));
    } else {
      await loadMessages();
    }
    void loadConversations();
  };

  const blockUser = async () => {
    if (!user || !active) return;
    const otherId = user.id === active.driver_id ? active.owner_id : active.driver_id;
    if (!otherId) { toast('Could not identify this user.', 'error'); return; }
    const { error } = await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: otherId });
    if (error) { toast('Could not block user: ' + error.message, 'error'); return; }
    toast('User blocked.');
    await loadBlockStatus();
  };

  const unblockUser = async () => {
    if (!user || !active) return;
    const otherId = user.id === active.driver_id ? active.owner_id : active.driver_id;
    if (!otherId) { toast('Could not identify this user.', 'error'); return; }
    const { error } = await supabase
      .from('blocks')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', otherId);
    if (error) { toast('Could not unblock user: ' + error.message, 'error'); return; }
    toast('Member unblocked.');
    await loadBlockStatus();
  };

  const contactSupport = async () => {
    if (!active || supportRequest.trim().length < 10) return;
    setRequestingSupport(true);
    const { error } = await supabase.rpc('request_conversation_support', {
      p_conversation_id: active.id,
      p_message: supportRequest.trim(),
    });
    setRequestingSupport(false);
    if (error) { toast('Could not contact support: ' + error.message, 'error'); return; }
    setSupportRequest('');
    setShowSupportRequest(false);
    toast('Support request sent. An administrator can now open this exact conversation.');
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
  const chatClosed = !activeGroup?.items.some((conversation) => !conversation.closed_at);
  const chatBlocked = blockStatus.i_blocked_other || blockStatus.blocked_by_other;
  const supportSessionActive = Boolean(activeGroup?.items.some((conversation) => conversation.support_reopened_at && !conversation.support_resolved_at && !conversation.closed_at));
  const adminClosedChat = Boolean(activeGroup?.items.some((conversation) => conversation.closed_at && conversation.admin_closed_at));
  const memberConnectionChat = Boolean(active?.driver_id && active?.owner_id);

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
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">{conversationGroups.length}</span>
          </div>
          {conversationGroups.map((group) => {
            const c = group.latest;
            const otherUser = user?.id === c.driver_id ? (c.owner || c.admin) : user?.id === c.owner_id ? (c.driver || c.admin) : (c.driver || c.owner);
            const online = isProfileOnline(otherUser);
            return (
              <button key={group.key} onClick={() => { setActive(group.activeConversation); navigate(`/chat/${group.activeConversation.id}`); }} className={cn('group relative flex w-full items-center gap-3 border-b border-ink-50 p-3 text-left transition hover:bg-brand-50/60', activeGroup?.key === group.key && 'bg-brand-50 shadow-[inset_3px_0_0_0_theme(colors.brand.500)] dark:bg-brand-950/25')}>
                <Avatar name={otherUser?.full_name || 'User'} src={otherUser?.avatar_url} size={44} verified={!!otherUser?.is_verified} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink-900">
                    {otherUser?.full_name} <VerifiedBadge verified={otherUser?.is_verified} size={11} />
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-500">{c.vehicle?.make && <CarFront className="h-3 w-3 shrink-0" />}{c.vehicle?.make ? `${c.vehicle.make} ${c.vehicle.model}` : c.admin_id ? `${settings.site_name} Admin` : 'Conversation'}{group.items.length > 1 ? ` · ${group.items.length} connections` : ''}</p>
                  <p className={cn('mt-0.5 flex items-center gap-1 text-[10px]', online ? 'font-semibold text-emerald-600' : 'text-ink-400')}><span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-ink-300')} />{lastSeenText(otherUser)}</p>
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
                  <button onClick={() => { setActive(null); navigate('/chat'); }} aria-label="Back to conversations" className="lg:hidden"><ArrowLeft className="h-5 w-5 text-ink-500" /></button>
                  <Link to={`/members/${other.id}`} title={`View ${other.full_name}'s profile`} aria-label={`View ${other.full_name}'s profile`} className="rounded-full transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-400">
                    <Avatar name={other.full_name} src={other.avatar_url} size={40} verified={other.is_verified} />
                  </Link>
                  <div>
                    <Link to={`/members/${other.id}`} className="flex items-center gap-1 font-semibold text-ink-900 hover:text-brand-700 hover:underline">{other.full_name} <VerifiedBadge verified={other.is_verified} size={12} /></Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">{active.vehicle_id ? <><CarFront className="h-3 w-3" /> Vehicle conversation</> : active.admin_id ? `${settings.site_name} support` : 'Member conversation'}<span aria-hidden="true">·</span><span className={cn('inline-flex items-center gap-1', isProfileOnline(other) ? 'font-semibold text-emerald-600' : 'text-ink-400')}><span className={cn('h-1.5 w-1.5 rounded-full', isProfileOnline(other) ? 'bg-emerald-500' : 'bg-ink-300')} />{lastSeenText(other)}</span></p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {memberConnectionChat && <button onClick={() => setShowSupportRequest(true)} aria-label="Contact support about this conversation" title="Contact support about this conversation" className="inline-flex items-center gap-1 rounded-full px-2 py-2 text-violet-600 hover:bg-violet-100 dark:text-violet-300"><Headphones className="h-4 w-4" /><span className="hidden text-xs font-semibold sm:inline">Support</span></button>}
                  <button onClick={() => setShowReport(true)} aria-label="Report conversation" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Flag className="h-4 w-4" /></button>
                  {blockStatus.i_blocked_other ? (
                    <button onClick={() => setConfirmSafetyAction('unblock')} aria-label="Unblock user" title="Unblock user" className="rounded-full bg-amber-50 p-2 text-amber-700 hover:bg-amber-100"><Ban className="h-4 w-4" /></button>
                  ) : (
                    <button onClick={() => setConfirmSafetyAction('block')} aria-label="Block user" title="Block user" className="rounded-full p-2 text-ink-400 hover:bg-ink-100 hover:text-danger"><Ban className="h-4 w-4" /></button>
                  )}
                </div>
              </div>

              {supportSessionActive && (
                <div className="flex items-start gap-2 border-b border-violet-200 bg-violet-100/80 px-4 py-3 text-violet-950 dark:bg-violet-950/35 dark:text-violet-100">
                  <Headphones className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-xs leading-5"><strong>Support session active:</strong> An administrator reopened this ended chat. Both members can message while support helps resolve the issue.</p>
                </div>
              )}

              <div className="flex items-start gap-2 border-b border-violet-100 bg-violet-50/80 px-4 py-2.5 text-violet-900 dark:bg-violet-950/20 dark:text-violet-100">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="text-xs leading-5"><strong>Dispute support:</strong> An authorised administrator may review and join this chat if a report, safety concern, or dispute needs help resolving.</p>
              </div>

              {chatBlocked && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="flex items-start gap-2">
                    <Ban className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold">Messaging is blocked</p>
                      <p className="text-xs leading-5">
                        {blockStatus.i_blocked_other && blockStatus.blocked_by_other
                          ? 'You blocked this member, and they have also blocked you. You can remove only your own block.'
                          : blockStatus.i_blocked_other
                            ? 'You blocked this member. Unblock them to restore your side of messaging.'
                            : 'This member has blocked messaging with you. Only they can remove their block.'}
                      </p>
                    </div>
                  </div>
                  {blockStatus.i_blocked_other && <button onClick={() => setConfirmSafetyAction('unblock')} className="btn-secondary shrink-0 px-3 py-1.5 text-xs">Unblock member</button>}
                </div>
              )}

              {/* Messages */}
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.08),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(139,92,246,0.08),transparent_36%)] bg-ink-50/50 p-4 sm:p-5">
                {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center text-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-brand-100 dark:bg-[#1d1d20]"><Sparkles className="h-6 w-6" /></span><p className="mt-3 text-sm font-semibold text-ink-800">Start the conversation</p><p className="mt-1 max-w-xs text-xs text-ink-500">Keep arrangements in chat so both members have a clear record.</p></div>}
                {messages.map((m, index) => {
                  const mine = m.sender_id === user?.id;
                  const fromSupport = m.sender?.role === 'admin' && m.type !== 'system';
                  const senderName = m.type === 'system' ? `${settings.site_name} system` : fromSupport ? `Official ${settings.site_name} Support` : mine ? (profile?.full_name || 'You') : (m.sender?.full_name || other.full_name || 'Member');
                  const previous = messages[index - 1];
                  const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(m.created_at).toDateString();
                  return (
                    <div key={m.id}>
                      {showDay && <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-ink-100" /><span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold text-ink-400 shadow-sm ring-1 ring-ink-100 dark:bg-[#1d1d20]">{formatChatDay(m.created_at)}</span><span className="h-px flex-1 bg-ink-100" /></div>}
                      <div className={cn('flex', m.type === 'system' ? 'justify-center' : mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[72%]', m.type === 'system' ? 'bg-violet-50 text-center text-xs font-medium text-violet-800 ring-1 ring-violet-100 dark:bg-violet-950/30 dark:text-violet-200' : fromSupport ? 'rounded-bl-md border border-violet-200 bg-gradient-to-br from-violet-50 to-white text-violet-950 ring-1 ring-violet-100 dark:from-violet-950/40 dark:to-[#1d1d20] dark:text-violet-50' : mine ? 'rounded-br-md bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-brand-900/10' : 'rounded-bl-md bg-white text-ink-900 ring-1 ring-ink-100 dark:bg-[#1d1d20]')}>
                        <p className={cn('mb-1 flex items-center gap-1 text-[10px] font-bold', mine && m.type !== 'system' ? 'text-brand-100' : fromSupport || m.type === 'system' ? 'text-violet-700 dark:text-violet-300' : 'text-brand-700')}>{fromSupport && <Headphones className="h-3 w-3" />}{senderName}{fromSupport && <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-violet-700 dark:bg-violet-900/50 dark:text-violet-200">Support</span>}</p>
                        {m.type === 'image' ? (
                          <img src={m.content || ''} alt="" className="max-h-48 rounded-lg" />
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        )}
                        <div className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine && m.type !== 'system' ? 'text-brand-100' : 'text-ink-400')}>
                          {formatMessageTimestamp(m.created_at)}
                          {mine && <><span className="ml-1 font-semibold">{m.read ? 'Read' : 'Sent'}</span>{m.read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}</>}
                        </div>
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {chatClosed && <div className="flex flex-wrap items-start justify-between gap-3 border-t border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-semibold">{adminClosedChat ? 'Chat closed by support' : 'Connection ended — chat history preserved'}</p><p className="text-xs">{adminClosedChat ? 'Members cannot send new messages. The complete history remains saved and readable.' : 'This chat is read-only. Start a new connection, or contact support if help is needed with this conversation.'}</p></div></div>{memberConnectionChat && <button type="button" onClick={() => setShowSupportRequest(true)} className="btn-secondary shrink-0 px-3 py-1.5 text-xs"><Headphones className="h-3.5 w-3.5" /> Contact support</button>}</div>}

              {/* Emoji picker */}
              {!chatClosed && !chatBlocked && showEmoji && (
                <div className="flex flex-wrap gap-1 border-t border-ink-100 bg-white/95 p-2 shadow-[0_-6px_20px_rgba(0,0,0,0.03)] dark:bg-[#141416]">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { setText((t) => t + e); }} className="rounded-lg p-1.5 text-lg hover:bg-ink-100">{e}</button>
                  ))}
                </div>
              )}

              {/* Input */}
              {!chatClosed && !chatBlocked && <div className="flex items-center gap-2 border-t border-ink-100 bg-white p-3 dark:bg-[#141416]">
                <button onClick={() => setShowEmoji((v) => !v)} aria-label="Choose emoji" className="rounded-full p-2 text-ink-400 hover:bg-ink-100"><Smile className="h-5 w-5" /></button>
                <div className="relative flex-1"><input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => { setText(e.target.value); broadcastTyping(e.target.value.trim().length > 0); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message…"
                  className="input w-full rounded-2xl border-0 bg-ink-50 pr-16 ring-1 ring-ink-100 focus:bg-white focus:ring-brand-300"
                  maxLength={1000}
                  autoFocus
                /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-ink-300">{text.length}/1000</span></div>
                <button onClick={() => send()} disabled={!text.trim()} className="btn-primary h-10 w-10 rounded-full p-0 shadow-lg shadow-brand-600/20" aria-label="Send message"><Send className="h-4 w-4" /></button>
              </div>}
              {!chatClosed && !chatBlocked && otherTyping && <div className="border-t border-ink-100 bg-white px-4 pb-2 text-xs font-medium text-brand-700 dark:bg-[#141416]">
                <span className="inline-flex items-center gap-1"><span>{other.full_name} is typing</span><span className="animate-pulse">•••</span></span>
              </div>}
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
      {showSupportRequest && active && (
        <Modal title="Contact support about this chat" onClose={() => setShowSupportRequest(false)}>
          <div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-violet-100 dark:bg-violet-950/25 dark:text-violet-100">
            Your request is private. Support will receive a link to this exact conversation and can reopen an ended chat while helping resolve the issue.
          </div>
          <label className="label mt-4" htmlFor="support-request-message">What help do you need?</label>
          <textarea id="support-request-message" value={supportRequest} onChange={(event) => setSupportRequest(event.target.value)} rows={4} maxLength={1000} className="input" placeholder="Explain the issue and what you would like support to help with…" />
          <div className="mt-1 text-right text-xs text-ink-400">{supportRequest.length}/1000</div>
          <button type="button" onClick={contactSupport} disabled={requestingSupport || supportRequest.trim().length < 10} className="btn-primary mt-4 w-full"><Headphones className="h-4 w-4" /> {requestingSupport ? 'Sending request…' : 'Send to support'}</button>
        </Modal>
      )}
      {confirmSafetyAction && (
        <ConfirmDialog
          title={confirmSafetyAction === 'block' ? 'Block this member?' : 'Unblock this member?'}
          message={confirmSafetyAction === 'block'
            ? 'You will not be able to message each other until the block is removed. The other member will not be told why you blocked them.'
            : 'Messaging will be restored only if the other member has not also blocked you.'}
          confirmLabel={confirmSafetyAction === 'block' ? 'Block member' : 'Unblock member'}
          danger={confirmSafetyAction === 'block'}
          onConfirm={confirmSafetyAction === 'block' ? blockUser : unblockUser}
          onClose={() => setConfirmSafetyAction(null)}
        />
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

function formatMessageTimestamp(iso: string) {
  return new Date(iso).toLocaleString('en-KE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
