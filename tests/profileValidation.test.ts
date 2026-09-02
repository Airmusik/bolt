import assert from 'node:assert/strict';
import test from 'node:test';
import { hasValidNameFields, normalizePersonName, parseLanguages, splitPersonName } from '../src/lib/profileValidation.ts';

test('prefills both fields from an existing name', () => {
  assert.deepEqual(splitPersonName('Jane Wanjiku'), { firstName: 'Jane', secondName: 'Wanjiku' });
});

test('keeps all remaining names when an existing multi-part name is edited', () => {
  const fields = splitPersonName('  Mary-Jane   Njeri  Wanjiku  ');
  assert.deepEqual(fields, { firstName: 'Mary-Jane', secondName: 'Njeri Wanjiku' });
  assert.equal(normalizePersonName(`${fields.firstName} ${fields.secondName}`), 'Mary-Jane Njeri Wanjiku');
});

test('leaves the second field empty for legacy single-name profiles', () => {
  assert.deepEqual(splitPersonName('Esbon'), { firstName: 'Esbon', secondName: '' });
  assert.deepEqual(splitPersonName(''), { firstName: '', secondName: '' });
});

test('requires both fields even if one contains multiple names', () => {
  assert.equal(hasValidNameFields('Jane Wanjiku', ''), false);
  assert.equal(hasValidNameFields('', 'Jane Wanjiku'), false);
  assert.equal(hasValidNameFields('Jane', '  '), false);
  assert.equal(hasValidNameFields('J', 'Wanjiku'), false);
  assert.equal(hasValidNameFields('Jane', 'Wanjiku'), true);
});

test('keeps hyphenated and international names', () => {
  assert.equal(hasValidNameFields('Anne-Marie', "O'Neil"), true);
  assert.equal(hasValidNameFields('José', 'Núñez'), true);
});

test('normalizes and deduplicates languages without changing the requirement', () => {
  assert.deepEqual(parseLanguages(' English, english, Swahili, '), ['English', 'Swahili']);
});
