import test from 'node:test';
import assert from 'node:assert/strict';
import { AD_DEFAULTS, adIsVisible, adSettingsError, safeAdUrl, type AdSettings } from '../src/lib/ads.ts';

const valid: AdSettings = { ...AD_DEFAULTS, ads_provider: 'direct', ads_enabled: 'true', ads_sponsor: 'Example sponsor', ads_title: 'Example offer', ads_url: 'https://example.com/offer' };
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

test('AdSense needs approval confirmation and valid IDs; action ads stay disabled', () => {
  const settings: AdSettings = { ...AD_DEFAULTS, ads_provider: 'adsense', ads_enabled: 'true', ads_inline_enabled: 'true', ads_footer_enabled: 'true', ads_connection_enabled: 'true', ads_listing_enabled: 'true', adsense_publisher_id: 'ca-pub-1234567890123456', adsense_inline_slot: '1234567890', adsense_footer_slot: '0987654321' };
  assert.equal(adIsVisible(settings, 'inline'), false);
  const ready = { ...settings, adsense_ready: 'true' };
  assert.equal(adIsVisible(ready, 'inline'), true);
  assert.equal(adIsVisible(ready, 'footer'), true);
  assert.equal(adIsVisible(ready, 'connection'), false);
  assert.equal(adIsVisible(ready, 'listing'), false);
  assert.equal(adIsVisible({ ...ready, adsense_inline_slot: 'bad' }, 'inline'), false);
  assert.equal(adIsVisible({ ...ready, adsense_publisher_id: '' }, 'footer'), false);
  assert.equal(adIsVisible({ ...ready, ads_enabled: 'false' }, 'footer'), false);
});
