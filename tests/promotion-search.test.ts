import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchingPromotions, splitPromotedSearch, type LivePromotion } from '../src/lib/promotionSearch.ts';

const now = Date.parse('2026-09-11T12:00:00Z');
const campaign = (target_id: string, kind: LivePromotion['kind'] = 'listing', expires_at = '2026-09-12T12:00:00Z'): LivePromotion => ({ id: `ad-${target_id}`, kind, target_id, expires_at });
const ids = (items: { id: string }[]) => items.map(item => item.id);
const cars = [{ id: 'outside' }, { id: 'match' }, { id: 'organic' }];
const campaigns = [campaign('outside'), campaign('match')];

test('promotions stay above every search, including zero matches', () => {
  const empty = splitPromotedSearch(cars, [], campaigns, 'listing', now);
  assert.deepEqual(ids(empty.promoted), ['outside', 'match']);
  assert.deepEqual(empty.results, []);
  assert.equal(empty.matchingPromoted, 0);
});

test('matching promotions come first without duplicating cards or changing organic matches', () => {
  const result = splitPromotedSearch([...cars, cars[0]], [cars[1], cars[2], cars[2]], campaigns, 'listing', now);
  assert.deepEqual(ids(result.promoted), ['match', 'outside']);
  assert.deepEqual(ids(result.results), ['organic']);
  assert.equal(result.matchingPromoted, 1);
  assert.deepEqual(ids(cars), ['outside', 'match', 'organic']);
});

test('expired, disabled and wrong-kind promotions do not get paid placement', () => {
  for (const inactive of [[], [campaign('match', 'listing', '2026-09-11T12:00:00Z')], [campaign('match', 'listing', 'invalid')], [campaign('match', 'profile')]]) {
    const result = splitPromotedSearch(cars, cars, inactive, 'listing', now);
    assert.deepEqual(result.promoted, []);
    assert.deepEqual(ids(result.results), ids(cars));
  }
});

test('campaign IDs cannot expose records absent from eligible public discovery', () => {
  const result = splitPromotedSearch(cars, cars, [campaign('private'), campaign('suspended'), campaign('deleted')], 'listing', now);
  assert.deepEqual(result.promoted, []);
  assert.deepEqual(ids(result.results), ids(cars));
});

test('profile searches and legacy owner campaigns retain correct target matching', () => {
  assert.deepEqual(ids(splitPromotedSearch(cars, [], [campaign('match', 'profile')], 'profile', now).promoted), ['match']);
  assert.equal(matchingPromotions([campaign('owner', 'profile')], 'listing', 'car', 'owner', now).length, 1);
  assert.equal(matchingPromotions([campaign('owner', 'profile')], 'profile', 'different-driver', undefined, now).length, 0);
});

test('both browse pages show promotions above results without bypassing public discovery or availability', () => {
  const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
  for (const name of ['Cars', 'Drivers']) {
    const page = read(`pages/Browse${name}Page.tsx`);
    assert.ok(page.indexOf('<PromotedSearchSection') < page.indexOf('results.map('));
    assert.match(page, /supabase\.rpc\('discover_/);
    assert.match(page, /matchingPromoted > 0/);
  }
  assert.match(read('pages/BrowseCarsPage.tsx'), /vehicles\.filter\(isVehicleLive\)/);
  assert.match(read('pages/BrowseDriversPage.tsx'), /d.availability === 'available' && d.platform_history_approved && !d.is_suspended/);
  const section = read('components/PromotedSearchSection.tsx');
  assert.match(section, /Paid placements across Kenya/);
  assert.match(section, /outside your search filters/);
  assert.match(section, /overflow-x-auto/);
});
