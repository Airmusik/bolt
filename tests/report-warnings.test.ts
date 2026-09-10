import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeReportWarnings } from '../src/lib/reportWarnings.ts';
import type { UserWarning } from '../src/lib/types.ts';

const warning = { id: 'warning', message: 'Existing warning', revoked_at: null } as UserWarning;
test('reports handle a single embedded warning, a list, or no warning without crashing', () => {
  for (const warnings of [warning, [warning]]) {
    const report = normalizeReportWarnings({ id: 'report', warnings });
    assert.equal(report.id, 'report');
    assert.equal(report.warnings.some(w => !w.revoked_at), true);
    assert.deepEqual(report.warnings.map(w => w.message), ['Existing warning']);
  }
  for (const warnings of [undefined, null, []]) {
    assert.deepEqual(normalizeReportWarnings({ warnings }).warnings, []);
  }
});
test('revoked warning history is preserved without marking a warning as active', () => {
  const report = normalizeReportWarnings({ warnings: { ...warning, revoked_at: '2026-09-09T10:00:00Z' } });
  assert.equal(report.warnings.some(w => !w.revoked_at), false);
  assert.equal(report.warnings[0].message, warning.message);
});
test('both admin report data entry points normalize warnings before rendering', () => {
  const admin = readFileSync('src/pages/AdminPage.tsx', 'utf8');
  assert.match(admin, /\.\.\.normalizeReportWarnings\(report\)/);
  assert.match(admin, /setProfileReports\([^\n]+\.map\(normalizeReportWarnings\)/);
});
