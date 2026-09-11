import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { PUBLIC_PROFILE_FIELDS } from './profileSelect';
import { groupConversations } from './conversationInbox';
import type { Conversation, Message } from './types';

/** Read originals in place. No copying, deleting, or expanding conversation access. */
export function useLegacySupportMessages(memberId: string | null | undefined, viewerId?: string) {
  const [result, setResult] = useState<{ memberId: string; messages: Message[]; loading: boolean; error: boolean } | null>(null);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const conversations: Conversation[] = [];
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase.from('conversations')
            .select(`*, driver:profiles!conversations_driver_id_fkey(${PUBLIC_PROFILE_FIELDS}), owner:profiles!conversations_owner_id_fkey(${PUBLIC_PROFILE_FIELDS}), admin:profiles!conversations_admin_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
            .or(`driver_id.eq.${memberId},owner_id.eq.${memberId}`).order('id').range(offset, offset + 499);
          if (error) throw error;
          conversations.push(...(data as Conversation[] || []));
          if (!data || data.length < 500 || cancelled) break;
        }
        const ids = groupConversations(conversations, memberId).find(group => group.key === 'support')?.items.map(item => item.id) || [];
        const messages: Message[] = [];
        for (let batch = 0; batch < ids.length && !cancelled; batch += 100) {
          for (let offset = 0; ; offset += 500) {
            const { data, error } = await supabase.from('messages')
              .select(`*, sender:profiles!messages_sender_id_fkey(${PUBLIC_PROFILE_FIELDS})`)
              .in('conversation_id', ids.slice(batch, batch + 100)).order('created_at').order('id').range(offset, offset + 499);
            if (error) throw error;
            messages.push(...(data as Message[] || []));
            if (!data || data.length < 500 || cancelled) break;
          }
        }
        if (cancelled) return;
        setResult({ memberId, messages, loading: false, error: false });
        if (viewerId && document.visibilityState === 'visible') {
          const unread = messages.filter(message => !message.read && message.sender_id !== viewerId).map(message => message.id);
          for (let offset = 0; offset < unread.length && !cancelled; offset += 100) {
            await supabase.from('messages').update({ read: true }).in('id', unread.slice(offset, offset + 100)).eq('read', false);
          }
        }
      } catch {
        if (!cancelled) setResult(previous => ({ memberId, messages: previous?.memberId === memberId ? previous.messages : [], loading: false, error: true }));
      } finally { inFlight = false; }
    };
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const channel = supabase.channel(`legacy-support:${memberId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh).subscribe();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); void supabase.removeChannel(channel); };
  }, [memberId, viewerId, revision]);
  return { ...(result && result.memberId === memberId ? result : { messages: [] as Message[], loading: Boolean(memberId), error: false }), retry };
}
