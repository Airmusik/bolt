import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notice = readFileSync(new URL('../src/components/ChatNotice.tsx', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../src/pages/ChatPage.tsx', import.meta.url), 'utf8');

test('chat notices have accessible mobile-only close buttons and retain desktop notices', () => {
  assert.match(notice, /type="button"/);
  assert.match(notice, /aria-label=\{`Close \$\{label\}`\}/);
  assert.match(notice, /h-11 w-11[^\n]+sm:hidden/);
  assert.match(notice, /dismissed \? 'hidden sm:flex' : 'flex'/);
  assert.match(notice, /onClick=\{\(\) => setDismissed\(true\)\}/);
  assert.doesNotMatch(notice, /supabase|navigate|localStorage|setMessages|setText|endConnection/);
});

test('each notice has isolated state per conversation and preserves eligibility rules', () => {
  assert.match(chat, /supportSessionActive && \(\s*<ChatNotice key=\{`session:\$\{active.id\}`\} label="support session notice"/);
  assert.match(chat, /memberConnectionChat && !isDirectSupportConversation && \(\s*<ChatNotice key=\{`dispute:\$\{active.id\}`\} label="dispute support notice"/);
});
