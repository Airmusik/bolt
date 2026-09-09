type YouTubePlayer = { mute(): void; playVideo(): void; pauseVideo(): void; destroy(): void };
type YouTubeApi = { Player: new (frame: HTMLIFrameElement, options: { events: {
  onReady(event: { target: YouTubePlayer }): void;
  onStateChange(event: { data: number }): void;
  onError(event: { data: number }): void;
  onAutoplayBlocked(): void;
} }) => YouTubePlayer };
type VimeoPlayer = {
  ready(): Promise<void>; setMuted(muted: boolean): Promise<boolean>; play(): Promise<void>; pause(): Promise<void>; destroy(): Promise<void>;
  on(event: string, callback: () => void): void;
};
type VimeoApi = { Player: new (frame: HTMLIFrameElement) => VimeoPlayer };
type VideoWindow = Window & { YT?: YouTubeApi; Vimeo?: VimeoApi; onYouTubeIframeAPIReady?: () => void };
export type ExternalAdPlayer = { ready: Promise<void>; play(): Promise<void>; pause(): void; destroy(): void };

const scripts = new Map<string, Promise<void>>();
function loadPlayerSdk(kind: 'youtube' | 'vimeo'): Promise<void> {
  const page = window as VideoWindow;
  if (kind === 'youtube' ? page.YT?.Player : page.Vimeo?.Player) return Promise.resolve();
  const existing = scripts.get(kind);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = kind === 'youtube' ? 'https://www.youtube.com/iframe_api' : 'https://player.vimeo.com/api/player.js';
    script.async = true;
    let settled = false;
    const previousReady = page.onYouTubeIframeAPIReady;
    const ready = () => {
      try { previousReady?.(); } finally { finish(); }
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; window.clearTimeout(timer);
      if (kind === 'youtube' && page.onYouTubeIframeAPIReady === ready) page.onYouTubeIframeAPIReady = previousReady;
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const timer = window.setTimeout(() => finish(new Error('The video provider did not respond.')), 15000);
    script.onerror = () => finish(new Error('The video provider could not load.'));
    if (kind === 'youtube') page.onYouTubeIframeAPIReady = ready;
    else script.onload = () => finish(page.Vimeo?.Player ? undefined : new Error('Vimeo is unavailable.'));
    document.head.appendChild(script);
  });
  scripts.set(kind, promise);
  void promise.catch(() => scripts.delete(kind));
  return promise;
}

/** Official SDKs only. Provider windows/messages are handled by their SDK, not arbitrary postMessage code. */
export async function createExternalAdPlayer(frame: HTMLIFrameElement, kind: 'youtube' | 'vimeo', events: {
  state(playing: boolean): void; error(message: string): void; blocked(): void;
}): Promise<ExternalAdPlayer> {
  await loadPlayerSdk(kind);
  const page = window as VideoWindow;
  if (kind === 'youtube') {
    let destroyed = false;
    let resolveReady!: () => void;
    let rejectReady!: (reason: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    // Attach a handler immediately, even if the component unmounts before awaiting ready.
    void ready.catch(() => {});
    const player = new page.YT!.Player(frame, { events: {
      onReady: event => { if (!destroyed) { event.target.mute(); resolveReady(); } },
      onStateChange: event => { if (!destroyed && [0, 1, 2].includes(event.data)) events.state(event.data === 1); },
      onError: event => {
        if (destroyed) return;
        const message = [101, 150].includes(event.data) ? 'The owner does not allow this video to play on other websites.' : event.data === 153 ? 'YouTube could not verify this browser embed.' : 'YouTube cannot play this video here. It may be private, removed or restricted.';
        rejectReady(new Error(message)); events.error(message);
      },
      onAutoplayBlocked: () => { if (!destroyed) events.blocked(); },
    } });
    return { ready, play: async () => { player.mute(); player.playVideo(); }, pause: () => player.pauseVideo(), destroy: () => { destroyed = true; player.destroy(); } };
  }
  const player = new page.Vimeo!.Player(frame);
  let destroyed = false;
  player.on('play', () => { if (!destroyed) events.state(true); });
  player.on('pause', () => { if (!destroyed) events.state(false); });
  player.on('ended', () => { if (!destroyed) events.state(false); });
  player.on('error', () => { if (!destroyed) events.error('Vimeo cannot play this video here. Check its privacy and embedding settings.'); });
  const ready = player.ready().then(async () => { if (!destroyed) await player.setMuted(true); });
  void ready.catch(() => {});
  return { ready, play: async () => { await player.setMuted(true); await player.play(); }, pause: () => { void player.pause().catch(() => {}); }, destroy: () => { destroyed = true; void player.destroy().catch(() => {}); } };
}
