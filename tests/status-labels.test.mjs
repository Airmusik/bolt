import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('shared status labels have no decorative pill backgrounds', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const badge = css.match(/\.badge \{([^}]+)\}/)?.[1];
  assert.ok(badge);
  for (const style of ['rounded-none', 'border-0', 'bg-transparent', 'p-0', 'shadow-none', 'ring-0']) assert.ok(badge.includes(style));
  for (const variant of ['brand', 'warning', 'danger', 'neutral', 'accent', 'success']) {
    const styles = css.match(new RegExp(`\\.badge-${variant} \\{([^}]+)\\}`))?.[1];
    assert.ok(styles);
    assert.doesNotMatch(styles, /rounded-full|bg-|px-|py-|ring-/);
  }
  const admin = readFileSync('src/styles/admin.css', 'utf8');
  assert.doesNotMatch(admin, /\.admin-members \.badge-(?:success|warning|danger|neutral)/);
});

test('approval, promotion and availability retain meaningful labels', () => {
  const verified = readFileSync('src/components/VerifiedBadge.tsx', 'utf8');
  assert.match(verified, /Platform history approved/);
  assert.match(verified, /History not approved/);
  assert.doesNotMatch(verified, /rounded-full|bg-/);
  const card = readFileSync('src/components/VehicleCard.tsx', 'utf8');
  assert.match(card, /status-list mb-3" aria-label="Listing status"/);
  assert.match(card, /badge-success">Approved/);
  assert.match(card, /badge-brand">Live · Available/);
  assert.match(card, /badge-neutral">Not live/);
  assert.ok(card.indexOf('className="p-4"') < card.indexOf('aria-label="Listing status"'));
  const promotion = readFileSync('src/components/PromotionLink.tsx', 'utf8');
  assert.match(promotion, /badge-accent">Promoted/);
  const availability = readFileSync('src/components/AvailabilityBadge.tsx', 'utf8');
  assert.match(availability, /Currently on a connection/);
  assert.match(availability, /'badge-success' : isEngaged \? 'badge-warning' : 'badge-danger'/);
});
