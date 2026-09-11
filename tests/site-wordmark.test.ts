import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { siteWordmarkParts, siteWordmarkWidth } from '../src/lib/siteWordmark.ts';

test('new names keep their exact letters and get sensible two-colour parts', () => {
  for (const [name, first, second] of [
    ['11Drive', '11', 'Drive'], ['PlaDrive', 'Pla', 'Drive'],
    ['AutoLink', 'Auto', 'Link'], ['11 Drive', '11 ', 'Drive'],
    ['True Connections', 'True', ' Connections'], ['NEXO', 'NE', 'XO'],
    ['A', 'A', ''], ['🚗Road', '🚗Ro', 'ad'], ['日本車', '日本', '車'],
  ]) {
    const parts = siteWordmarkParts(name);
    assert.deepEqual(parts, { name, first, second });
    assert.equal(parts.first + parts.second, name);
    assert.ok(siteWordmarkWidth(name) >= 250);
  }
  assert.equal(siteWordmarkParts('   ').name, 'Site name');
  assert.equal(siteWordmarkParts('  New   Name  ').name, 'New Name');
  assert.ok(siteWordmarkWidth('Very Long Transport Company Name') > siteWordmarkWidth('AutoLink'));
});

test('all branded wordmarks use live settings including launch and admin previews', () => {
  const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  for (const path of ['components/Header.tsx', 'components/Footer.tsx', 'pages/AdminPage.tsx']) {
    const source = read(path);
    assert.match(source, /<SiteWordmark name=\{settings.site_name\}/);
    assert.doesNotMatch(source, /settings.site_name === '11Drive'/);
  }
  assert.match(read('App.tsx'), /nameColours=\{settings.header_name_colours\}/);
  assert.match(read('components/LaunchIntro.tsx'), /<SiteWordmark decorative name=\{siteName\} colours=\{nameColours\}/);
  const component = read('components/SiteWordmark.tsx');
  assert.match(component, /name === '11Drive'.*<ElevenDriveWordmark/);
  assert.match(component, /aria-label=\{decorative \? undefined : name\}/);
  assert.match(component, /site-wordmark-steering-wheel/);
  assert.match(component, /textLength=\{width - 150\}/);
  assert.match(component, /max-w-full/);
  assert.doesNotMatch(component, /dangerouslySetInnerHTML/);
});
