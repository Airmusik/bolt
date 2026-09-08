import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const admin = readFileSync('src/pages/AdminPage.tsx', 'utf8');
const header = readFileSync('src/components/Header.tsx', 'utf8');

test('desktop admin message panes keep scrolling inside the active chat', () => {
  assert.match(admin, /lg:h-\[68vh\] lg:min-h-0/);
  assert.ok((admin.match(/overflow-y-auto overscroll-contain/g) || []).length >= 2);
});

test('member updates control uses compact header sizing', () => {
  assert.match(header, /updates-header-button relative flex h-9 items-center gap-1/);
  assert.match(header, /updates-header-button[^']*text-ink-900/);
  assert.doesNotMatch(header, /updates-header-button[^']*border-accent/);
});
