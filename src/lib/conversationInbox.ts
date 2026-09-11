import type { Conversation } from './types';
import { isSupportPartner } from './supportIdentity.ts';

export function conversationActivity(conversation: Conversation) {
  return Date.parse(conversation.last_message_at || conversation.created_at) || 0;
}

export function conversationPartnerId(conversation: Conversation, userId: string) {
  if (userId === conversation.driver_id) return conversation.owner_id || conversation.admin_id;
  if (userId === conversation.owner_id) return conversation.driver_id || conversation.admin_id;
  if (userId === conversation.admin_id) return conversation.driver_id || conversation.owner_id;
  return null;
}

export function conversationPartner(conversation: Conversation, userId: string) {
  const id = conversationPartnerId(conversation, userId);
  return [conversation.driver, conversation.owner, conversation.admin].find(member => member?.id === id);
}

export function conversationInboxKey(conversation: Conversation, userId: string) {
  const partnerId = conversationPartnerId(conversation, userId);
  if (isSupportPartner(conversation, userId, conversationPartner(conversation, userId))) return 'support';
  return partnerId ? `member:${partnerId}` : `conversation:${conversation.id}`;
}

/** Group by account identity, never by name, vehicle, connection or assigned admin. */
export function groupConversations<T extends Conversation>(conversations: T[], userId: string) {
  const grouped = new Map<string, T[]>();
  for (const conversation of new Map(conversations.map(item => [item.id, item])).values()) {
    if (![conversation.driver_id, conversation.owner_id, conversation.admin_id].includes(userId)) continue;
    const key = conversationInboxKey(conversation, userId);
    grouped.set(key, [...(grouped.get(key) || []), conversation]);
  }
  return [...grouped].map(([key, items]) => {
    const ordered = [...items].sort((a, b) => conversationActivity(b) - conversationActivity(a) || a.id.localeCompare(b.id));
    return { key, items: ordered, latest: ordered[0], activeConversation: ordered.find(item => !item.closed_at) || ordered[0] };
  }).sort((a, b) => conversationActivity(b.latest) - conversationActivity(a.latest) || a.key.localeCompare(b.key));
}
