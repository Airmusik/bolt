import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const admin = readFileSync('src/pages/AdminPage.tsx', 'utf8');
const header = readFileSync('src/components/Header.tsx', 'utf8');
const wordmark = readFileSync('src/components/ElevenDriveWordmark.tsx', 'utf8');
const intro = readFileSync('src/components/LaunchIntro.tsx', 'utf8');

test('admin message panes keep scrolling on mobile and desktop', () => {
  const styles = readFileSync('src/styles/admin.css', 'utf8');
  assert.match(admin, /admin-message-inbox grid min-h-0 grid-rows-\[minmax\(0,1fr\)\]/);
  assert.match(admin, /aria-label="Message history" tabIndex=\{0\}/);
  assert.match(admin, /admin-message-history min-h-0 flex-1 space-y-3 overflow-y-auto/);
  assert.match(styles, /height: clamp\(28rem, 70dvh, 52rem\)/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
});

test('member updates control uses compact header sizing', () => {
  assert.match(header, /updates-header-button relative flex h-9 items-center gap-1/);
  assert.match(header, /updates-header-button[^']*text-ink-900/);
  assert.doesNotMatch(header, /updates-header-button[^']*border-accent/);
});

test('header logo uses a transparent vector asset without a solid-background filter', () => {
  assert.match(header, /ElevenDriveWordmark/);
  assert.doesNotMatch(header, /11drive-wordmark-steering-preview\.png/);
  assert.doesNotMatch(header, /brightness-0/);
  assert.match(wordmark, /viewBox="0 0 780 200"/);
  assert.match(wordmark, /site-wordmark-eleven/);
  assert.match(wordmark, /site-wordmark-drive/);
  assert.match(wordmark, /site-wordmark-steering-wheel/);
  assert.match(wordmark, /aria-label=\{decorative \? undefined : '11Drive'\}/);
  assert.match(intro, /siteName === '11Drive'/);
  assert.match(intro, /<ElevenDriveWordmark decorative/);
  assert.match(intro, /True Connections/);
  assert.match(intro, /launch-loading-line/);
});
