import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlatePrefix, validPlatePrefix } from '../src/lib/platePrefix.ts';
test('plate prefix accepts exactly three uppercase letters and never retains a full plate', () => {
  assert.equal(normalizePlatePrefix('kda'), 'KDA');
  assert.equal(normalizePlatePrefix('KDA 123A'), 'KDA');
  assert.equal(validPlatePrefix('KDA'), true);
  for (const value of ['', 'KD', 'KDAA', 'KD1', 'KDA 123A']) assert.equal(validPlatePrefix(value), false);
});
