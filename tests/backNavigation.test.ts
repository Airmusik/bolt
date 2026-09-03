import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPreviousSitePage } from '../src/lib/backNavigation.ts';
test('back navigation handles SPA history and full-page links from admin', () => {
  assert.equal(hasPreviousSitePage(2, 3, '', 'https://www.11drive.com/members/1'), true);
  assert.equal(hasPreviousSitePage(0, 3, 'https://www.11drive.com/admin?tab=cars', 'https://www.11drive.com/vehicles/1'), true);
});
test('direct visits, external referrers and invalid URLs use the safe fallback', () => {
  assert.equal(hasPreviousSitePage(0, 1, '', 'https://www.11drive.com/members/1'), false);
  assert.equal(hasPreviousSitePage(0, 4, 'https://example.com', 'https://www.11drive.com/members/1'), false);
  assert.equal(hasPreviousSitePage(0, 4, 'invalid', 'https://www.11drive.com/members/1'), false);
  assert.equal(hasPreviousSitePage(0, 4, 'https://www.11drive.com/admin', 'https://www.11drive.com/admin'), false);
});
