import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('advisory surfaces use theme-aware neutrals instead of pastel warning panels', () => {
  for (const path of ['components/DriverApprovalNotice.tsx', 'components/TermsContent.tsx', 'components/PlatePrivacyEditor.tsx', 'components/CommunityRoom.tsx', 'pages/DriverOnboardingPage.tsx', 'pages/NotificationsPage.tsx']) {
    const text = source(path);
    assert.doesNotMatch(text, /bg-(?:amber|yellow|violet)-50\b|bg-gradient/, path);
    assert.match(text, /bg-ink-50/, path);
  }
  assert.match(source('components/CommunityRoom.tsx'), /Contact details won’t be shared/);
  assert.match(source('pages/DriverOnboardingPage.tsx'), /Your submission is locked while admins review it/);
});

test('decorative empty states and chat canvases have no coloured glows', () => {
  assert.doesNotMatch(source('components/EmptyState.tsx'), /gradient|blur-3xl|Sparkles/);
  assert.doesNotMatch(source('styles/community.css'), /gradient/);
  assert.doesNotMatch(source('index.css').match(/\.chat-canvas\s*\{([^}]+)\}/)[1], /gradient/);
});

test('all private chat surfaces share high-contrast outgoing messages and retain support labels', () => {
  for (const path of ['pages/ChatPage.tsx', 'pages/ContactPage.tsx', 'pages/AdminPage.tsx']) {
    assert.match(source(path), /chat-outgoing/, path);
    assert.match(source(path), /text-white\/80/, path);
    assert.match(source(path), /Official/, path);
    assert.doesNotMatch(source(path), /bg-violet-|text-violet-/, path);
  }
  assert.match(source('index.css'), /\.chat-outgoing\s*\{\s*background-color: #30343b;\s*color: #fff;/);
  assert.match(source('index.css'), /\.dark \.chat-outgoing\s*\{\s*background-color: #414853;/);
});

test('analytics use the admin-selected accent for a single data series, not rainbow gradients', () => {
  assert.doesNotMatch(source('components/PromotionAnalytics.tsx'), /bg-(?:emerald|sky|violet)-/);
  assert.doesNotMatch(source('components/AdminSiteAnalytics.tsx'), /gradient/);
  assert.match(source('components/AdminSiteAnalytics.tsx'), /bg-accent-500/);
});

test('urgency, ratings and availability retain semantic colours and labels', () => {
  assert.match(source('components/DocumentExpiry.tsx'), /expired \? 'border-red-300/);
  assert.match(source('components/DocumentExpiry.tsx'), /nearExpiry \? 'border-amber-200/);
  assert.match(source('components/DocumentExpiry.tsx'), /Renew this document/);
  assert.match(source('components/CommunityRoom.tsx'), /session\?\.enabled \? "bg-emerald-500"/);
  assert.match(source('pages/SettingsPage.tsx'), /This cannot be undone/);
  assert.match(source('pages/SettingsPage.tsx'), /bg-red-50/);
  assert.match(source('pages/VehicleDetailsPage.tsx'), /iss.severity === 'major' && 'bg-red-500'/);
});
