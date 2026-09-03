import test from 'node:test';
import assert from 'node:assert/strict';
import { AD_DEFAULTS, adIsVisible, adSettingsError, safeAdUrl, type AdSettings } from '../src/lib/ads.ts';

const valid: AdSettings = { ...AD_DEFAULTS, ads_enabled: 'true', ads_sponsor: 'Example sponsor', ads_title: 'Example offer', ads_url: 'https://example.com/offer' };
test('all ad placements are off by default and require their individual switch', () => {
  for (const placement of ['inline','footer','connection','listing'] as const) {
    assert.equal(adIsVisible(AD_DEFAULTS, placement), false);
    assert.equal(adIsVisible(valid, placement), false);
    const enabled = { ...valid, [`ads_${placement}_enabled`]: 'true' };
    assert.equal(adIsVisible(enabled, placement), true);
    assert.equal(adIsVisible({ ...enabled, ads_enabled: 'false' }, placement), false);
  }
});
test('unsafe destinations and incomplete ads never render', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://user:secret@example.com', '//example.com', '']) {
    assert.equal(safeAdUrl(url), null);
    assert.equal(adIsVisible({ ...valid, ads_footer_enabled: 'true', ads_url: url }, 'footer'), false);
  }
  assert.ok(adSettingsError({ ...valid, ads_title: ' ' }));
  assert.ok(adSettingsError({ ...valid, ads_sponsor: '' }));
  assert.ok(adSettingsError({ ...valid, ads_body: 'x'.repeat(181) }));
  assert.equal(safeAdUrl('https://example.com/offer'), 'https://example.com/offer');
});
