import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AD_DEFAULTS, AD_PLACEMENTS, adIsVisible, adSettingsError, safeAdUrl, safeAdMediaUrl, adMediaFileError, adPageAllowed, videoAdIsVisible, type AdSettings } from '../src/lib/ads.ts';

const valid: AdSettings = { ...AD_DEFAULTS, ads_provider: 'direct', ads_enabled: 'true', ads_sponsor: 'Example sponsor', ads_title: 'Example offer', ads_url: 'https://example.com/offer' };
test('all ad placements are off by default and require their individual switch', () => {
  for (const { id: placement } of AD_PLACEMENTS) {
    assert.equal(adIsVisible(AD_DEFAULTS, placement), false);
    assert.equal(adIsVisible(valid, placement), false);
    const enabled = { ...valid, [`ads_${placement}_enabled`]: 'true' };
    assert.equal(adIsVisible(enabled, placement), true);
    assert.equal(adIsVisible({ ...enabled, ads_enabled: 'false' }, placement), false);
  }
});

const videoSettings: AdSettings = { ...AD_DEFAULTS, ads_provider: 'direct', ads_enabled: 'true', ads_video_enabled: 'true', ads_video_sponsor: 'Example', ads_video_title: 'Video headline', ads_video_url: 'https://example.com/ad.mp4', ads_video_destination: 'https://example.com/offer' };
test('footer video has an independent creative and obeys the master switch', () => {
  assert.equal(videoAdIsVisible(AD_DEFAULTS), false);
  assert.equal(videoAdIsVisible(videoSettings), true);
  assert.equal(adSettingsError(videoSettings), null, 'video-only direct campaign is valid');
  assert.equal(videoAdIsVisible({ ...videoSettings, ads_enabled: 'false' }), false);
  assert.equal(videoAdIsVisible({ ...videoSettings, ads_video_enabled: 'false' }), false);
  assert.equal(videoAdIsVisible({ ...videoSettings, ads_video_destination: 'javascript:alert(1)' }), false);
  assert.equal(videoAdIsVisible({ ...videoSettings, ads_video_url: 'https://youtube.com/watch?v=test' }), false);
  assert.ok(adSettingsError({ ...videoSettings, ads_video_title: '' }));
  assert.ok(adSettingsError({ ...videoSettings, ads_inline_enabled: 'true' }), 'banner placement still needs banner creative');
  assert.equal(videoAdIsVisible({ ...videoSettings, ads_provider: 'adsense' }), true, 'direct footer video is independent of the banner provider');
  assert.equal(adSettingsError({ ...videoSettings, ads_provider: 'adsense' }), null, 'video-only campaign does not require Google display units');
  assert.ok(adSettingsError({ ...videoSettings, ads_provider: 'adsense', ads_inline_enabled: 'true' }), 'enabling Google units still requires approval and setup');
});

test('media URLs reject script, HTML pages, embedded credentials and unsupported formats', () => {
  assert.equal(safeAdMediaUrl('https://example.com/ad.MP4?version=2', 'video'), 'https://example.com/ad.MP4?version=2');
  assert.equal(safeAdMediaUrl('https://example.com/banner.webp', 'image'), 'https://example.com/banner.webp');
  for (const url of ['javascript:alert(1)', 'data:video/mp4,test', 'http://example.com/ad.mp4', 'https://a:b@example.com/ad.mp4', 'https://youtube.com/watch?v=1', 'https://example.com/ad.svg']) assert.equal(safeAdMediaUrl(url, 'video'), null);
  assert.equal(safeAdMediaUrl('https://example.com/ad.mp4', 'image'), null);
  assert.ok(adSettingsError({ ...valid, ads_image_url: 'https://example.com/unsafe.svg' }));
  assert.ok(adSettingsError({ ...valid, ads_cta: 'x'.repeat(31) }));
});

test('native uploads accept supported media and reject oversized, empty and MIME-mismatched files', () => {
  assert.equal(adMediaFileError({ name: 'video.MP4', type: 'video/mp4', size: 8 * 1024 * 1024 }, 'video'), null);
  assert.equal(adMediaFileError({ name: 'video.webm', type: '', size: 100 }, 'video'), null);
  assert.equal(adMediaFileError({ name: 'cover.jpeg', type: 'image/jpeg', size: 100 }, 'image'), null);
  for (const file of [{ name: 'ad.mp4', type: 'text/html', size: 100 }, { name: 'ad.mov', type: 'video/quicktime', size: 100 }, { name: 'ad.mp4', type: 'video/mp4', size: 0 }, { name: 'ad.mp4', type: 'video/mp4', size: 8 * 1024 * 1024 + 1 }]) assert.ok(adMediaFileError(file, 'video'));
  assert.ok(adMediaFileError({ name: 'ad.png', type: 'image/png', size: 3 * 1024 * 1024 + 1 }, 'image'));
});

test('ads never enter sensitive workflows or dashboard conversations', () => {
  for (const path of ['/admin', '/admin/login', '/chat/123', '/contact', '/help', '/login', '/register', '/onboarding/proof', '/vehicles/new', '/vehicles/123/edit', '/notifications', '/privacy', '/terms', '/settings']) assert.equal(adPageAllowed(path), false, path);
  for (const tab of ['chats', 'connections', 'applications', 'vehicles']) assert.equal(adPageAllowed('/dashboard', `?tab=${tab}`), false);
  for (const path of ['/', '/browse-cars', '/browse-drivers', '/vehicles/123', '/drivers/123', '/members/123']) assert.equal(adPageAllowed(path), true);
  assert.equal(adPageAllowed('/dashboard', '?tab=overview'), true);
  assert.equal(adPageAllowed('/dashboard'), true);
});

test('new slots are wired to real pages and do not turn into unsupported Google units', () => {
  for (const [file, placement] of [['HomePage', 'home'], ['BrowseCarsPage', 'browse'], ['BrowseDriversPage', 'browse'], ['DashboardPage', 'dashboard'], ['VehicleDetailsPage', 'detail'], ['DriverProfilePage', 'detail']]) {
    assert.ok(readFileSync(`src/pages/${file}.tsx`, 'utf8').includes(`placement="${placement}"`), `${file} has the placement`);
    assert.equal(adIsVisible({ ...valid, ads_provider: 'adsense', [`ads_${placement}_enabled`]: 'true' }, placement as 'home'), false);
  }
  assert.ok(readFileSync('src/components/Footer.tsx', 'utf8').includes('<FooterVideoAd />'));
});

test('video uses muted inline playback, visibility and user controls, not a floating overlay', () => {
  const source = readFileSync('src/components/FooterVideoAd.tsx', 'utf8');
  for (const expected of ['muted playsInline loop preload="none"', 'element.muted = true', 'IntersectionObserver', 'visibilitychange', 'prefers-reduced-motion', 'saveData', 'element.pause()', 'manuallyPaused', 'Close video advertisement', 'sponsored noopener noreferrer']) assert.ok(source.includes(expected), expected);
  assert.ok(!source.includes('position: fixed'));
  assert.ok(readFileSync('src/components/AdminAdMediaField.tsx', 'utf8').includes('Upload selected file'));
  assert.ok(readFileSync('src/components/AdminAdvertisements.tsx', 'utf8').includes('changedSettings(settings, baseline.current, Object.keys(AD_DEFAULTS))'));
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
