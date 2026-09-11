import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('member rating is checked before showing the button, and hidden after success', () => {
  const source = readFileSync('src/components/MemberReviewButton.tsx', 'utf8');
  assert.match(source, /useState\(true\)/);
  assert.match(source, /eq\('reviewer_id', reviewerId\).eq\('reviewee_id', targetId\).limit\(1\)/);
  assert.match(source, /if \(reviewed\) return null/);
  assert.match(source, /!loading && !checkFailed && <button/);
  assert.match(source, /setReviewed\(true\); setOpen\(false\)/);
  assert.match(source, /key=\{`\$\{user.id\}:\$\{target\}`\}/);
  assert.match(source, /saveLock.current/);
  assert.match(source, /window.addEventListener\('focus', refresh\)/);
  assert.match(source, /postgres_changes/);
  assert.doesNotMatch(source, /if \(!open/);
  assert.doesNotMatch(source, /One review per connection/);
});
