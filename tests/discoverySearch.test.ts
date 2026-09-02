import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscoveryUrl } from '../src/lib/discoverySearch.ts';

test('car search preserves make/model and location filters', () => {
  const url = new URL(buildDiscoveryUrl('car', ' Toyota Axio ', ' Ongata Rongai '), 'https://example.com');
  assert.equal(url.pathname, '/browse-cars');
  assert.equal(url.searchParams.get('q'), 'Toyota Axio');
  assert.equal(url.searchParams.get('location'), 'Ongata Rongai');
});

test('driver intent carries location without the previous car keyword', () => {
  assert.equal(buildDiscoveryUrl('driver', 'Toyota', 'Utawala'), '/browse-drivers?location=Utawala');
});

test('empty searches still browse all cars or drivers', () => {
  assert.equal(buildDiscoveryUrl('car', '  ', '  '), '/browse-cars');
  assert.equal(buildDiscoveryUrl('driver', 'Toyota', ''), '/browse-drivers');
});

test('special characters cannot change the search destination or add filters', () => {
  const url = new URL(buildDiscoveryUrl('car', 'Toyota & q=Honda', 'Lang’ata / Nairobi'), 'https://example.com');
  assert.equal(url.searchParams.get('q'), 'Toyota & q=Honda');
  assert.equal(url.searchParams.get('location'), 'Lang’ata / Nairobi');
  assert.equal(url.searchParams.size, 2);
});
