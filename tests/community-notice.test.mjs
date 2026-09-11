import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const room = readFileSync(new URL('../src/components/CommunityRoom.tsx', import.meta.url), 'utf8');

test('mobile community notice can close without removing the guidelines entry point', () => {
  assert.match(room, /aria-label="Close community notice"/);
  assert.match(room, /noticeDismissed \? "hidden sm:flex" : "flex"/);
  assert.match(room, /setNoticeDismissed\(true\); guidelinesButton\.current\?\.focus\(\)/);
  assert.match(room, /h-11 w-11[^\n]+sm:hidden/);
  assert.match(room, /ref=\{guidelinesButton\}/);
  assert.match(room, /setNoticeDismissed\(false\); props\.onGuidelines\?\.\(\)/);
});

test('closing the notice does not bypass rule acceptance or discard draft/messages', () => {
  const close = room.match(/aria-label="Close community notice"\s+onClick=\{([^\n]+)\}/)[1];
  assert.doesNotMatch(close, /setDraft|setReply|onSend|rules_accepted|localStorage|sessionStorage|navigate/);
  assert.match(room, /!session\.muted && session\.rules_accepted === true/);
  assert.match(room, /Read & accept guidelines/);
});
