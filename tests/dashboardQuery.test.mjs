import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('owner applications explicitly select the driver relationship, not the ambiguous profiles relation', () => {
  const source = readFileSync(new URL('../src/pages/DashboardPage.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('driver:profiles!applications_driver_id_fkey('));
  assert.ok(!source.includes('driver:profiles('));
});
