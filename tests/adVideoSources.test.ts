import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AD_DEFAULTS, resolveAdVideo, adVideoEmbedUrl, videoAdDestination, adSettingsError } from '../src/lib/ads.ts';
import { createExternalAdPlayer } from '../src/lib/adVideoPlayers.ts';

test('YouTube watch, share, Shorts, live and privacy embed links resolve to the same safe video', () => {
  for (const link of ['https://www.youtube.com/watch?v=M7lc1UVf-VE&autoplay=1', 'https://youtu.be/M7lc1UVf-VE?si=tracking', 'https://m.youtube.com/shorts/M7lc1UVf-VE', 'https://www.youtube.com/live/M7lc1UVf-VE', 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE']) {
    const source = resolveAdVideo(link)!;
    assert.equal(source.kind, 'youtube'); assert.equal(source.id, 'M7lc1UVf-VE');
    assert.equal(source.url, 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
    const embed = new URL(adVideoEmbedUrl(source, 'https://www.11drive.com')!);
    assert.equal(embed.host, 'www.youtube-nocookie.com');
    assert.equal(embed.searchParams.get('origin'), 'https://www.11drive.com');
    assert.equal(embed.searchParams.get('autoplay'), '0', 'SDK must mute before scripted playback');
    assert.equal(embed.searchParams.get('controls'), '1');
    assert.equal(embed.searchParams.has('si'), false);
  }
});

test('Vimeo normal and unlisted links preserve the privacy hash without copying arbitrary embed parameters', () => {
  for (const link of ['https://vimeo.com/76979871/8272103f6e', 'https://player.vimeo.com/video/76979871?h=8272103f6e&autoplay=1']) {
    const source = resolveAdVideo(link)!;
    assert.equal(source.kind, 'vimeo'); assert.equal(source.hash, '8272103f6e');
    const embed = new URL(adVideoEmbedUrl(source, 'https://www.11drive.com')!);
    assert.equal(embed.origin, 'https://player.vimeo.com');
    assert.equal(embed.searchParams.get('h'), '8272103f6e');
    assert.equal(embed.searchParams.get('muted'), '1');
    assert.equal(embed.searchParams.get('autoplay'), '0');
    assert.equal(embed.searchParams.get('dnt'), '1');
  }
});

test('arbitrary websites and misleading domains never become iframe sources', () => {
  for (const link of ['https://youtube.com.evil.example/watch?v=M7lc1UVf-VE', 'https://www.youtube.com:444/embed/M7lc1UVf-VE', 'https://vimeo.com.evil.example/76979871', 'https://example.com/embed/123', 'https://youtube.com/watch?v=%3Cscript%3E', 'https://www.tiktok.com/@example/video/123', 'https://facebook.com/reel/123']) {
    const source = resolveAdVideo(link)!;
    assert.equal(source.kind, 'link'); assert.equal(adVideoEmbedUrl(source, 'https://www.11drive.com'), null);
  }
  for (const link of ['javascript:alert(1)', 'data:text/html,bad', 'http://youtube.com/watch?v=M7lc1UVf-VE', 'https://user:password@youtube.com/watch?v=M7lc1UVf-VE']) assert.equal(resolveAdVideo(link), null);
});

test('file URLs and explicit extensionless video mode use the native player, never an iframe', () => {
  assert.equal(resolveAdVideo('https://example.com/clip.mp4?signature=abc')?.kind, 'file');
  assert.equal(resolveAdVideo('https://example.com/download/123')?.kind, 'link');
  const file = resolveAdVideo('https://example.com/download/123', 'file')!;
  assert.equal(file.kind, 'file'); assert.equal(adVideoEmbedUrl(file, 'https://www.11drive.com'), null);
});

test('destination defaults to the original source and optional campaign overrides remain validated', () => {
  const ad = { ...AD_DEFAULTS, ads_provider: 'direct', ads_enabled: 'true', ads_video_enabled: 'true', ads_video_sponsor: 'Example sponsor', ads_video_title: 'Our video', ads_video_url: 'https://youtu.be/M7lc1UVf-VE' };
  assert.equal(adSettingsError(ad), null);
  assert.equal(videoAdDestination(ad), 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
  assert.equal(videoAdDestination({ ...ad, ads_video_destination: 'https://example.com/offer' }), 'https://example.com/offer');
  assert.equal(videoAdDestination({ ...ad, ads_video_destination: 'javascript:bad' }), null);
  assert.ok(adSettingsError({ ...ad, ads_video_source_type: 'iframe' }));
});

test('official YouTube controller mutes before play, exposes pause, and surfaces restrictions', async () => {
  const previous = globalThis.window;
  const calls: string[] = [];
  let callbacks: { onReady(event: { target: Player }): void; onError(event: { data: number }): void };
  class Player {
    constructor(_frame: unknown, options: { events: typeof callbacks }) { callbacks = options.events; queueMicrotask(() => callbacks.onReady({ target: this })); }
    mute() { calls.push('mute'); } playVideo() { calls.push('play'); } pauseVideo() { calls.push('pause'); } destroy() { calls.push('destroy'); }
  }
  globalThis.window = { YT: { Player } } as unknown as typeof window;
  let error = '';
  try {
    const player = await createExternalAdPlayer({} as HTMLIFrameElement, 'youtube', { state: () => {}, blocked: () => {}, error: message => { error = message; } });
    await player.ready; await player.play(); player.pause();
    assert.deepEqual(calls.slice(0, 4), ['mute', 'mute', 'play', 'pause']);
    callbacks.onError({ data: 101 }); assert.match(error, /owner does not allow/);
    player.destroy(); assert.equal(calls.at(-1), 'destroy');
  } finally { globalThis.window = previous; }
});

test('official Vimeo controller starts muted and uses its SDK for playback and cleanup', async () => {
  const previous = globalThis.window;
  const calls: string[] = [];
  class Player {
    ready() { return Promise.resolve(); } on() {}
    setMuted(value: boolean) { calls.push(`mute:${value}`); return Promise.resolve(value); }
    play() { calls.push('play'); return Promise.resolve(); } pause() { calls.push('pause'); return Promise.resolve(); } destroy() { calls.push('destroy'); return Promise.resolve(); }
  }
  globalThis.window = { Vimeo: { Player } } as unknown as typeof window;
  try {
    const player = await createExternalAdPlayer({} as HTMLIFrameElement, 'vimeo', { state: () => {}, error: () => {}, blocked: () => {} });
    await player.ready; await player.play(); player.pause(); player.destroy();
    assert.deepEqual(calls, ['mute:true', 'mute:true', 'play', 'pause', 'destroy']);
  } finally { globalThis.window = previous; }
});

test('embeds are visible before playback, have correct referrer and remain separate from redirect links', () => {
  const embed = readFileSync('src/components/ExternalAdVideo.tsx', 'utf8');
  for (const text of ['intersectionRatio > 0.5', 'strict-origin-when-cross-origin', 'min-h-[200px]', 'visibilitychange', 'prefers-reduced-motion', 'saveData', 'player?.destroy()', 'createExternalAdPlayer']) assert.ok(embed.includes(text), text);
  assert.ok(!embed.includes('window.open'));
  const card = readFileSync('src/components/FooterVideoAd.tsx', 'utf8');
  assert.ok(card.includes('videoAdDestination(settings)'));
  assert.ok(card.includes('opens source in a new tab'));
});
