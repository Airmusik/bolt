import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

test('public member reviews select the author relationship explicitly', () => {
  for (const file of ['DriverProfilePage', 'VehicleDetailsPage']) {
    const source = readFileSync(`src/pages/${file}.tsx`, 'utf8');
    assert.match(source, /reviewer:profiles!reviews_reviewer_id_fkey/);
    assert.match(source, /Reviews could not load/);
  }
});

test('feedback has native accessible star controls and written comments', () => {
  const stars = readFileSync('src/components/StarRatingInput.tsx', 'utf8');
  const feedback = readFileSync('src/components/ExperienceFeedback.tsx', 'utf8');
  assert.match(stars, /type="radio"/);
  assert.match(stars, /<fieldset disabled=\{disabled\}>/);
  assert.match(stars, /h-11 w-11/);
  assert.match(feedback, /maxLength=\{2000\}/);
  assert.match(feedback, /Not now/);
  assert.match(feedback, /claim_experience_prompt/);
  assert.match(feedback, /document.visibilityState/);
  assert.match(feedback, /\['INPUT', 'TEXTAREA'\]/);
});

test('bell animation respects reduced motion and uses the live admin accent', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const header = readFileSync('src/components/Header.tsx', 'utf8');
  const notifications = readFileSync('src/pages/NotificationsPage.tsx', 'utf8');
  assert.match(css, /\.notification-bell-badge \{ color: var\(--action\); \}/);
  assert.match(header, /notification-bell-link[^']*text-ink-900/);
  assert.doesNotMatch(css, /\.notification-bell-badge \{ background:/);
  assert.doesNotMatch(notifications, /notification-bell-badge[^"\n]*rounded-full/);
  assert.match(css, /updates-icon-react/);
  assert.match(header, /updates-header-icon/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.notification-bell-icon/);
  assert.match(header, /notification-bell-icon/);
  assert.match(notifications, /notification-bell-badge/);
});
