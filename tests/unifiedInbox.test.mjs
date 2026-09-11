import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('chat and dashboard use one identity-based grouping and one support destination', () => {
  const chat = source('pages/ChatPage.tsx'), dashboard = source('pages/DashboardPage.tsx');
  assert.match(chat, /return groupConversations\(conversations, user.id\)/);
  assert.match(chat, /filter\(group => group.key !== 'support'\)/);
  assert.equal((chat.match(/<SupportInboxEntry /g) || []).length, 1);
  assert.match(chat, /key === 'support'.*navigate\(supportInboxPath\(\), \{ replace: true \}\)/);
  assert.doesNotMatch(chat, /if \(conversations.length === 0\)/, 'support-only users must reach the inbox');
  assert.match(dashboard, /tab === 'chats' && <Navigate replace to="\/chat"/);
  assert.doesNotMatch(dashboard, /function ChatsTab\(/);
});

test('member and admin support read originals and preserve all thread history', () => {
  for (const page of ['pages/ContactPage.tsx', 'pages/AdminPage.tsx']) {
    const text = source(page);
    assert.match(text, /useLegacySupportMessages\(/);
    assert.match(text, /mergeSupportHistory\([^\n]+legacy.messages/);
    assert.match(text, /<LegacySupportContent message=\{entry.legacy\}/);
  }
  const legacy = source('lib/useLegacySupportMessages.ts');
  assert.match(legacy, /group.key === 'support'/);
  assert.match(legacy, /range\(offset, offset \+ 499\)/);
  assert.doesNotMatch(legacy, /\.delete\(|\.insert\(|\.upsert\(/);
  assert.match(legacy, /result && result.memberId === memberId/, 'never expose previous account history during a switch');
});

test('realtime and RPC acknowledgement cannot leave two copies of a sent message', () => {
  const chat = source('pages/ChatPage.tsx');
  assert.match(chat, /message.id !== optimisticId && message.id !== savedMessage.id/);
});
