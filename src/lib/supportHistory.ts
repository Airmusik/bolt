import type { ContactMessage, ContactMessageEntry } from './types';

/** Legacy support threads are one chronological inbox history, not new chats. */
export function mergeSupportHistory(threads: Pick<ContactMessage, 'entries'>[]): ContactMessageEntry[] {
  const entries = new Map<string, ContactMessageEntry>();
  for (const thread of threads) for (const entry of thread.entries || []) {
    if (!entry.unsent_at) entries.set(entry.id, entry);
  }
  return [...entries.values()].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
}
