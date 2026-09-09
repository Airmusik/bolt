import { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { adVideoEmbedUrl, type AdVideoSource } from '@/lib/ads';
import { createExternalAdPlayer, type ExternalAdPlayer } from '@/lib/adVideoPlayers';

export function ExternalAdVideo({ source, title, preview }: { source: AdVideoSource; title: string; preview: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const controls = useRef<ExternalAdPlayer | null>(null);
  const visible = useRef(false);
  const manuallyPaused = useRef(false);
  const autoPaused = useRef(false);
  const started = useRef(false);
  const requestPlay = useRef<() => void>(() => {});
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const provider = source.kind === 'youtube' ? 'YouTube' : 'Vimeo';
  const embed = adVideoEmbedUrl(source, window.location.origin);

  useEffect(() => {
    const element = host.current;
    if (!element || !embed || !['youtube', 'vimeo'].includes(source.kind)) return;
    let active = true;
    let player: ExternalAdPlayer | null = null;
    let creating = false;
    let failed = false;
    let isReady = false;
    let timeout: number | undefined;
    setLoaded(false); setReady(false); setPlaying(false); setError('');
    manuallyPaused.current = false; autoPaused.current = false; started.current = false;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const autoAllowed = () => !preview && !motion.matches && !connection?.saveData && !manuallyPaused.current;
    const fail = (message: string) => {
      if (!active) return;
      failed = true;
      setError(message); setPlaying(false); setReady(false);
      window.clearTimeout(timeout); isReady = false;
      player?.destroy(); player = null; controls.current = null;
      element.replaceChildren();
    };
    const play = () => {
      if (failed || !isReady || !player || !visible.current || document.hidden) return;
      autoPaused.current = false;
      void player.play().catch(() => { if (active) { setPlaying(false); } });
    };
    const sync = () => {
      if (!active || failed) return;
      if (!visible.current || document.hidden) { autoPaused.current = true; player?.pause(); return; }
      if (autoAllowed()) { if (!creating) void load(false); else if (isReady) play(); }
    };
    const load = async (manual: boolean) => {
      if (creating || !active || failed) return;
      creating = true; setLoaded(true);
      const frame = document.createElement('iframe');
      frame.src = embed;
      frame.title = title || `${provider} sponsor video`;
      frame.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.className = 'h-full w-full border-0';
      element.replaceChildren(frame);
      timeout = window.setTimeout(() => fail(`${provider} did not load. Use the source link below.`), 25000);
      try {
        player = await createExternalAdPlayer(frame, source.kind as 'youtube' | 'vimeo', {
          state: next => {
            if (!active || failed) return;
            if (next && (!visible.current || document.hidden)) { autoPaused.current = true; player?.pause(); return; }
            if (!next && started.current && !autoPaused.current && visible.current && !document.hidden) manuallyPaused.current = true;
            if (next) { started.current = true; manuallyPaused.current = false; }
            setPlaying(next);
          },
          error: fail,
          blocked: () => { if (active) setPlaying(false); },
        });
        if (!active || failed) { player.destroy(); return; }
        controls.current = player;
        await player.ready;
        if (!active || failed) return;
        window.clearTimeout(timeout); isReady = true; setReady(true);
        if (manual || autoAllowed()) play();
      } catch (reason) { fail(reason instanceof Error ? reason.message : `${provider} is unavailable.`); }
    };
    requestPlay.current = () => { manuallyPaused.current = false; if (!creating) void load(true); else play(); };
    const preferencesChanged = () => { autoPaused.current = true; player?.pause(); sync(); };
    // YouTube requires more than half the player to be visible before scripted autoplay.
    const observer = new IntersectionObserver(entries => { visible.current = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0.5); sync(); }, { threshold: [0, 0.51] });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', preferencesChanged);
    connection?.addEventListener('change', preferencesChanged);
    return () => { active = false; window.clearTimeout(timeout); observer.disconnect(); player?.destroy(); controls.current = null; element.replaceChildren(); document.removeEventListener('visibilitychange', sync); motion.removeEventListener('change', preferencesChanged); connection?.removeEventListener('change', preferencesChanged); };
  }, [embed, source.kind, title, provider, preview]);

  return <div>
    {/* Keep the provider controls uncovered, with YouTube's minimum 200px player height. */}
    <div className="relative aspect-video min-h-[200px] bg-black">
      <div ref={host} className="absolute inset-0" />
      {(!loaded || error) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-sm text-white">
        <p>{error || `Play ${provider} video here`}</p>
        {!error && <button type="button" onClick={() => requestPlay.current()} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-black"><Play className="h-4 w-4" />Load video</button>}
      </div>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 text-xs text-ink-500">
      <span>{provider} player · starts muted</span>
      {ready && !error && <button type="button" className="btn-ghost min-h-11 px-3 text-xs" onClick={() => {
        if (playing) { manuallyPaused.current = true; controls.current?.pause(); setPlaying(false); }
        else requestPlay.current();
      }}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? 'Pause' : 'Play'}</button>}
    </div>
    {error && <p role="status" className="px-3 pt-2 text-xs text-ink-600">The source link remains available below.</p>}
  </div>;
}
