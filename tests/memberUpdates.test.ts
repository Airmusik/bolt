import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { updateFromSearch } from '../src/lib/memberUpdates.ts';
test('email update IDs are strictly validated and cannot supply a navigation destination', () => {
  const id='00000000-0000-0000-0000-000000000100';
  assert.equal(updateFromSearch('?update='+id),id);
  for(const search of ['', '?update=/chat', '?update=https://example.com', '?update=bad-id', '?update=<script>']) assert.equal(updateFromSearch(search),null);
});
test('signed-in update links retain their page and focus only their own loaded update', () => {
  const page=readFileSync('src/pages/UpdatesPage.tsx','utf8');
  assert.match(page,/\.eq\('user_id', user.id\)\.eq\('type', 'admin_announcement'\)/);
  assert.match(page,/id=\{`update-\$\{update.id\}`\}/);
  assert.match(page,/focusedUpdate.current === selectedUpdate/);
  assert.match(page,/\{settings.site_name\} Updates/);
  const route=readFileSync('src/components/ProtectedRoute.tsx','utf8');
  assert.match(route,/!\['\/onboarding', '\/updates'\]\.includes\(location.pathname\)/);
});
