import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('shared safety notice stays neutral and retains its safety copy and accessible terms link', () => {
  const notice = source('components/MemberSafetyNotice.tsx');
  assert.match(notice, /border-ink-100 bg-ink-50/);
  assert.match(notice, /text-ink-600/);
  assert.match(notice, /text-ink-900/);
  assert.doesNotMatch(notice, /amber-|yellow-|gradient/);
  assert.match(notice, /platform-history approval is not identity verification or a safety guarantee/);
  assert.match(notice, /\{settings.site_name\}/);
  assert.match(notice, /to="\/terms" target="_blank" rel="noopener noreferrer"/);
  assert.match(notice, /focus-visible:outline-2/);
});

test('dialog backdrops do not invert to white with dark-mode ink tokens', () => {
  const modal = source('components/Modal.tsx');
  const viewer = source('components/DocumentViewer.tsx');
  assert.match(modal, /bg-black\/40 backdrop-blur-sm/);
  assert.match(viewer, /bg-black\/60 backdrop-blur-sm/);
  for (const content of [modal, viewer]) assert.doesNotMatch(content, /bg-ink-950\//);
});

test('chat back button keeps theme-aware hover, pressed and keyboard focus states', () => {
  const chat = source('pages/ChatPage.tsx');
  const button = chat.match(/aria-label="Back" className="([^"]+)"/)[1];
  assert.match(button, /text-ink-600/);
  assert.match(button, /hover:bg-ink-100/);
  assert.match(button, /active:bg-ink-200/);
  assert.match(button, /focus-visible:outline-2/);
  assert.doesNotMatch(button, /bg-white/);
});

test('listing filters share readable selected/unselected admin styles', () => {
  const admin = source('pages/AdminPage.tsx');
  assert.match(admin, /aria-pressed=\{carStatusFilter === filter\}[^\n]+className="admin-member-filter /);
  const css = source('styles/admin.css');
  assert.match(css, /\.admin-member-filter \{[^}]*color: rgb\(var\(--ink-700\)\)/);
  assert.match(css, /\.dark \.admin-member-filter\[aria-pressed="true"\] \{[^}]*background: #3a424e;[^}]*color: #fff;/);
});
