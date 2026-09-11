import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSupportThreads, mergeSupportHistory } from '../src/lib/supportHistory.ts';
import type { ContactMessage, ContactMessageEntry, Message } from '../src/lib/types';
const entry = (id: string, day: number, unsent_at: string | null = null) => ({ id, created_at: `2026-09-${String(day).padStart(2,'0')}T12:00:00Z`, unsent_at } as ContactMessageEntry);
test('older support cases share one chronological history without duplicates or recalled messages', () => {
  const a=entry('a',1), b=entry('b',3), c=entry('c',2), removed=entry('removed',4,'2026-09-05');
  const threads=[{entries:[b,removed]},{entries:[a,c,b]},{entries:undefined}];
  assert.deepEqual(mergeSupportHistory(threads).map(e=>e.id), ['a','c','b']);
  assert.equal(threads[0].entries?.length,2,'source threads remain unchanged');
  assert.deepEqual(mergeSupportHistory([]),[]);
});

test('copied legacy messages show once, retain attachments, and include newer originals', () => {
  const copy = { ...entry('copy', 1), sender_id: 'admin', contact_message_id: 'thread', body: '[Image shared in the previous direct-support chat]' };
  const image = { id: 'image', sender_id: 'admin', conversation_id: 'old', created_at: copy.created_at, content: 'private/image.jpg', type: 'image' } as Message;
  const newer = { ...image, id: 'newer', type: 'text', created_at: '2026-09-02T12:00:00Z', content: 'Later reply' } as Message;
  const merged = mergeSupportHistory([{ legacy_conversation_id: 'old', entries: [copy] }], [image, newer, image], 'member');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].legacy?.content, 'private/image.jpg');
  assert.equal(merged[0].body, null);
  assert.equal(merged[1].body, 'Later reply');
  assert.equal(merged[0].id, 'copy');
});

test('recalled imported messages are not resurrected from the old chat', () => {
  const copy = { ...entry('copy', 1, '2026-09-02'), sender_id: 'admin' };
  const message = { id: 'original', sender_id: 'admin', conversation_id: 'old', created_at: copy.created_at, content: 'Recalled', type: 'text' } as Message;
  assert.equal(mergeSupportHistory([{ legacy_conversation_id: 'old', entries: [copy] }], [message], 'member').length, 0);
});

test('identical text is not deduplicated across unrelated messages or conversations', () => {
  const copy = { ...entry('copy', 1), sender_id: 'member', body: 'Hello' };
  const message = { id: 'original', sender_id: 'member', conversation_id: 'different', created_at: copy.created_at, content: 'Hello', type: 'text' } as Message;
  const result = mergeSupportHistory([{ legacy_conversation_id: 'old', entries: [copy] }], [message], 'member');
  assert.equal(result.length, 2);
  assert.equal(result.find(item => item.legacy)?.sender_role, 'user');
});

test('admin inbox groups registered accounts, preserves old links, keeps guests separate', () => {
  const thread = (id: string, user_id: string | null, status = 'resolved') => ({ id, user_id, status, name: 'Same name', email: 'same@example.test', updated_at: '2026-09-01', entries: [entry(id, 1)] } as ContactMessage);
  const threads = [thread('old','member'), thread('new','member','new'), thread('other','different-member'), thread('guest-a',null), thread('guest-b',null)];
  const groups = groupSupportThreads([...threads, threads[0]]);
  assert.equal(groups.length, 4);
  const member = groups.find(group => group.items.some(item => item.id === 'old'))!;
  assert.equal(member.latest.status, 'new');
  assert.equal(member.latest.entries?.length, 2);
  assert.equal(member.items.length, 2);
  assert.equal(threads.length, 5, 'no original requests are deleted');
});

test('import matching preserves PostgreSQL microsecond timestamps', () => {
  const copy = { ...entry('copy', 1), sender_id: 'admin', created_at: '2026-09-01T12:00:00.123456+00:00' };
  const original = { id: 'original', sender_id: 'admin', conversation_id: 'old', created_at: '2026-09-01T12:00:00.123456Z', content: 'Copied message', type: 'text' } as Message;
  const distinct = { ...original, id: 'distinct', content: 'Another message', created_at: '2026-09-01T12:00:00.123455Z' };
  const history = mergeSupportHistory([{ legacy_conversation_id: 'old', entries: [copy] }], [distinct, original]);
  assert.equal(history.length, 2);
  assert.equal(history.find(item => item.id === 'copy')?.body, 'Copied message');
});
