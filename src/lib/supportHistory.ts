import type { ContactMessage, ContactMessageEntry, Message } from './types';

export type SupportHistoryEntry = ContactMessageEntry & { legacy?: Message };

// PostgreSQL stores microseconds; Date.parse alone would collapse distinct rows
// written within the same millisecond.
const importKey = (conversation: string, sender: string | null, time: string) =>
  `${conversation}:${sender}:${Date.parse(time)}:${(time.match(/\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(3)}`;

/** Legacy support threads are one chronological inbox history, not new chats. */
export function mergeSupportHistory(
  threads: Pick<ContactMessage, 'entries' | 'legacy_conversation_id'>[],
  legacyMessages: Message[] = [],
  memberId?: string,
): SupportHistoryEntry[] {
  const entries = new Map<string, SupportHistoryEntry>();
  const imports = new Map<string, ContactMessageEntry[]>();
  for (const thread of threads) for (const entry of thread.entries || []) {
    if (thread.legacy_conversation_id) {
      const key = importKey(thread.legacy_conversation_id, entry.sender_id, entry.created_at);
      const copies = imports.get(key) || [];
      if (!copies.some(copy => copy.id === entry.id)) copies.push(entry);
      imports.set(key, copies);
    }
    if (!entry.unsent_at) entries.set(`contact:${entry.id}`, entry);
  }
  for (const message of new Map(legacyMessages.map(item => [item.id, item])).values()) {
    // The old migration copied each message with its sender and exact timestamp.
    // Match only within that explicitly linked conversation, never by body text.
    const copy = imports.get(importKey(message.conversation_id, message.sender_id, message.created_at))?.shift();
    if (copy?.unsent_at) continue; // Do not resurrect a recalled imported message.
    if (copy) entries.delete(`contact:${copy.id}`);
    const media = message.type === 'image' || message.type === 'file';
    entries.set(`legacy:${message.id}`, {
      ...(copy || {}),
      id: copy?.id || `legacy:${message.id}`,
      contact_message_id: copy?.contact_message_id || '',
      sender_id: message.sender_id,
      sender_role: message.sender_id === memberId ? 'user' : 'admin',
      body: media ? null : message.content,
      attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null,
      created_at: message.created_at,
      sender: message.sender,
      legacy: message,
    });
  }
  return [...entries.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}

/** All requests from the same registered account share one admin inbox row.
 * Guest requests stay separate: a supplied name/email is not a verified identity. */
export function groupSupportThreads(threads: ContactMessage[]) {
  const groups = new Map<string, ContactMessage[]>();
  for (const thread of new Map(threads.map(item => [item.id, item])).values()) {
    const key = thread.user_id ? `member:${thread.user_id}` : `guest:${thread.id}`;
    groups.set(key, [...(groups.get(key) || []), thread]);
  }
  return [...groups].map(([key, items]) => {
    const ordered = [...items].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.id.localeCompare(b.id));
    const latest = ordered[0];
    const status = items.some(item => item.status === 'new') ? 'new' : items.some(item => item.status === 'open') ? 'open' : 'resolved';
    return { key, items: ordered, latest: { ...latest, status, entries: mergeSupportHistory(items) } as ContactMessage };
  }).sort((a, b) => Date.parse(b.latest.updated_at) - Date.parse(a.latest.updated_at) || a.key.localeCompare(b.key));
}
