import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedbackIsRecent, feedbackRoute, feedbackStorageKey } from '../src/lib/experienceFeedback.ts';
import { supportInboxPath } from '../src/lib/supportInbox.ts';

test('feedback dismissal is isolated by account and expires at the correct boundary', () => {
  const now = Date.parse('2026-09-09T12:00:00Z');
  assert.equal(feedbackIsRecent('2026-09-03T12:00:00Z','chat',now),true);
  assert.equal(feedbackIsRecent('2026-09-02T12:00:00Z','chat',now),false);
  assert.equal(feedbackIsRecent('2026-08-11T12:00:00Z','site',now),true);
  assert.equal(feedbackIsRecent('2026-08-10T12:00:00Z','site',now),false);
  assert.equal(feedbackIsRecent('invalid','site',now),false);
  assert.equal(feedbackIsRecent('2030-01-01','site',now),false);
  assert.notEqual(feedbackStorageKey('a','site'),feedbackStorageKey('b','site'));
});
test('feedback popup persists while browsing but excludes sensitive upload and authentication routes', () => {
  for (const path of ['/', '/dashboard', '/chat', '/notifications']) assert.equal(feedbackRoute(path).allowed,true);
  for (const path of ['/admin','/register','/onboarding','/vehicles/new','/vehicles/car/edit','/login']) assert.equal(feedbackRoute(path).allowed,false);
  assert.equal(feedbackRoute('/chat/10000000-0000-4000-8000-000000000001').conversationId,'10000000-0000-4000-8000-000000000001');
  const source=readFileSync('src/components/ExperienceFeedback.tsx','utf8');
  assert.match(source, /<Prompt key=\{user.id\}/);
  assert.match(source, /return invitation \? <FeedbackDialog/);
  assert.match(source, /rememberSubmission\(/);
  assert.match(source, /setRecent\(true\); setOpen\(false\)/);
  assert.match(source, /FEEDBACK_SUBMITTED_EVENT, clearMatching/);
});
test('all old support links resolve into the member Messages inbox', () => {
  assert.equal(supportInboxPath(),'/chat?view=support');
  assert.equal(supportInboxPath('?message=abc&topic=listing-limit'),'/chat?view=support&message=abc&topic=listing-limit');
  assert.equal(supportInboxPath('?view=admin&next=https://example.test'),'/chat?view=support');
  const chat=readFileSync('src/pages/ChatPage.tsx','utf8');
  assert.match(chat, /<SupportInboxEntry/);
  assert.match(chat, /params.get\('view'\) === 'support'/);
  assert.match(chat, /<SupportMessagesPage/);
});
