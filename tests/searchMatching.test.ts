import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesLocation, matchesPlatform, withinBudget } from '../src/lib/searchMatching.ts';

test('location matching is case insensitive but never includes unknown locations for a specific search', () => {
  assert.equal(matchesLocation('Nairobi', ' nairobi '), true);
  assert.equal(matchesLocation('Nairobi, Kenya', 'Nairobi'), true);
  assert.equal(matchesLocation('', 'Nairobi'), false);
  assert.equal(matchesLocation(null, 'Nairobi'), false);
  assert.equal(matchesLocation(null, ''), true);
});
test('price filters exclude unpriced listings and invalid budgets', () => {
  assert.equal(withinBudget(9000, '10000'), true);
  assert.equal(withinBudget(11000, '10000'), false);
  assert.equal(withinBudget(null, '10000'), false);
  assert.equal(withinBudget(null, ''), true);
  assert.equal(withinBudget(100, '-1'), false);
  assert.equal(withinBudget(100, 'abc'), false);
});
test('platform filters match normalized values and allow all platforms when empty', () => {
  assert.equal(matchesPlatform(['Uber', 'bolt'], 'uber'), true);
  assert.equal(matchesPlatform(['bolt'], 'uber'), false);
  assert.equal(matchesPlatform(null, ''), true);
});
