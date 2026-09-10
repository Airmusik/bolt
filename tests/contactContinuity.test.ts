import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const page = readFileSync('src/pages/ContactPage.tsx', 'utf8');
const migration = readFileSync('supabase/migrations/20260909010000_contact_continuity_and_guest_email.sql', 'utf8');

test('signed-in support submissions continue the existing message thread', () => {
  assert.match(page, /rpc\('send_member_support_message'/);
  assert.match(migration, /WHERE user_id = v_user_id[\s\S]*ORDER BY updated_at DESC/);
  assert.match(migration, /INSERT INTO public\.contact_message_entries/);
});

test('contact messages open in history and fit narrow screens', () => {
  assert.match(page, /navigate\(supportInboxPath/);
  assert.match(page, /to="\/chat"/);
  assert.match(page, /submissionInFlight\.current = true/);
  assert.match(page, /overflow-x-hidden/);
  assert.match(page, /break-all text-sm/);
  assert.doesNotMatch(page, /Your message history|Support history|Choose previous messages/);
  assert.match(page, /history\.map\(\(entry\)/);
  assert.match(page, /min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain/);
  const chat = readFileSync('src/pages/ChatPage.tsx', 'utf8');
  assert.match(chat, /supportView \? <SupportMessagesPage embedded \/>/);
  assert.doesNotMatch(chat, /return <SupportMessagesPage/);
});

test('guest messages and admin replies are delivered by a retryable email queue', () => {
  assert.match(migration, /direction IN \('guest_to_admin', 'admin_to_guest'\)/);
  assert.match(migration, /'reply_to', CASE WHEN direction = 'guest_to_admin' THEN thread\.email ELSE support_address END/);
  assert.match(migration, /cron\.schedule\('support-email-delivery'/);
});
