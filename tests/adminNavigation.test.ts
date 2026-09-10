import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adminDestination, adminNavOrder, adminView, canonicalAdminParams } from '../src/lib/adminNavigation.ts';
import { changedSettings, mergeSettingsDraft } from '../src/lib/adminSettingsDraft.ts';

test('old admin links open their matching grouped section, without losing notification context', () => {
  for (const [old, tab, section, value] of [
    ['controls', 'settings', 'settings', 'controls'],
    ['documents', 'reviews', 'review', 'files'],
    ['history', 'reviews', 'review', 'history'],
    ['expired', 'reviews', 'review', 'expired'],
  ]) {
    const oldParams = new URLSearchParams(`tab=${old}&message=existing-thread`);
    const next = canonicalAdminParams(oldParams);
    assert.equal(next.get('tab'), tab);
    assert.equal(next.get(section), value);
    assert.equal(next.get('message'), 'existing-thread');
    assert.deepEqual(adminView(next), adminView(oldParams));
    assert.equal(canonicalAdminParams(next).toString(), next.toString());
  }
});

test('navigation and browser history select the correct admin subsection', () => {
  const original = new URLSearchParams('tab=reviews&review=files');
  const controls = adminDestination(original, 'controls');
  assert.equal(adminView(controls).tab, 'settings');
  assert.equal(adminView(controls).settings, 'controls');
  assert.equal(controls.has('review'), false);
  const back = adminView(original);
  assert.equal(back.tab, 'reviews'); assert.equal(back.review, 'files');
  assert.equal(adminView(new URLSearchParams('tab=reviews&review=unknown')).review, 'history');
  assert.equal(adminView(new URLSearchParams('tab=settings&settings=unknown')).settings, 'branding');
  assert.equal(adminView(new URLSearchParams('tab=unknown')).tab, 'overview');
  assert.equal(adminDestination(controls, 'contact').has('settings'), false);
});

test('saved button order maps merged sections once and preserves distinct support and ad tools', () => {
  const available = ['overview','members','reviews','settings','contact','chat','promotions','advertisements'] as const;
  const result = adminNavOrder('members,documents,history,expired,controls,settings,missing,contact', available);
  assert.deepEqual(result, ['members','reviews','settings','contact','overview','chat','promotions','advertisements']);
  assert.equal(new Set(result).size, result.length);
  assert.deepEqual(adminNavOrder('', available), available);
});

test('admin navigation removes duplicate buttons but keeps existing approval and moderation actions', () => {
  const page = readFileSync('src/pages/AdminPage.tsx', 'utf8');
  const tabs = page.slice(page.indexOf('  const tabs:'), page.indexOf('  const completeNavOrder'));
  assert.equal((tabs.match(/key: '/g) || []).length, 17);
  assert.match(tabs, /label: 'Uploads & reviews'/);
  assert.doesNotMatch(tabs, /key: '(controls|documents|expired|history)'/);
  assert.doesNotMatch(page, /> Dashboard<\/button>/);
  assert.equal((page.match(/<AdminMemberUpload users=\{users\} onSaved=\{load\} \/>/g) || []).length, 1);
  assert.match(page, /initialUser=\{uploadUser\}/); // Useful profile-specific shortcut stays.
  for (const action of ['approveVehiclePhoto','verifyDoc','approvePlatformHistory','AdminExpiredDocuments','setReviewingVehicle','AdminMessageInbox','AdminChat']) assert.ok(page.includes(action));
  assert.match(page, /aria-label="Upload review sections"/);
  assert.match(page, /aria-label="Settings sections"/);
});

test('branding and operational settings have one editor and one shared save path', () => {
  const page = readFileSync('src/pages/AdminPage.tsx', 'utf8');
  const settings = page.slice(page.indexOf('function AdminSettings('), page.indexOf('function FooterSettingInput'));
  const controls = readFileSync('src/components/AdminControlCentre.tsx', 'utf8');
  assert.doesNotMatch(settings, /id="admin-maintenance"|id="admin-require-email"|id="admin-max-vehicles"/);
  const fields = readFileSync('src/lib/adminControlFields.ts', 'utf8');
  assert.equal((fields.match(/key:'maintenance_mode'/g) || []).length, 1);
  assert.equal((fields.match(/key:'require_email'/g) || []).length, 1);
  assert.match(settings, /<AdminControlCentre settings=\{settings\} onChange=\{setSettings\}/);
  assert.match(settings, /changedSettings\(nextSettings, baseline.current, ADMIN_SETTINGS_KEYS\)/);
  assert.doesNotMatch(controls, /from\('site_settings'\)\.upsert/);
});

test('draft edits survive settings refreshes while untouched values follow other admin changes', () => {
  const previous = { name: 'Site', maintenance: 'false', colour: 'blue', ads: 'off' };
  const draft = { ...previous, name: 'Draft name', maintenance: 'true' };
  const remote = { ...previous, colour: 'orange', ads: 'on' };
  const merged = mergeSettingsDraft(draft, previous, remote);
  assert.deepEqual(merged, { name: 'Draft name', maintenance: 'true', colour: 'orange', ads: 'on' });
  assert.deepEqual(changedSettings(merged, remote, ['name','maintenance','colour']), [['name','Draft name'],['maintenance','true']]);
  assert.deepEqual(changedSettings(remote, remote, ['name','maintenance','colour']), []);
  assert.deepEqual(changedSettings({ ...draft, ads: 'on' }, previous, ['name','maintenance']), [['name','Draft name'],['maintenance','true']]);
});
