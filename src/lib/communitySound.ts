import type { CommunityMessage } from "./community";

// Initial history, pagination, edits and replayed events are not new arrivals.
export class CommunityArrivals {
  private seen = new Set<string>();
  private own = new Set<string>();
  private latest = -Infinity;
  private ready = false;
  rememberOwn(id: string) {
    this.own.add(id);
  }
  observe(rows: CommunityMessage[], ownAlias?: string): boolean {
    let incoming = false;
    for (const row of rows) {
      if (
        this.ready &&
        !this.seen.has(row.id) &&
        Date.parse(row.created_at) >= this.latest &&
        !row.removed &&
        !this.own.has(row.id) &&
        !(row.member_role !== "admin" && row.alias === ownAlias)
      )
        incoming = true;
      this.seen.add(row.id);
    }
    this.latest = rows.reduce(
      (latest, row) => Math.max(Date.parse(row.created_at) || 0, latest),
      this.latest,
    );
    this.ready = true;
    return incoming;
  }
}

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
let context: AudioContext | null = null;
let lastTone = -Infinity;
export async function unlockCommunityAudio() {
  try {
    const Constructor =
      window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!Constructor) return;
    context ??= new Constructor();
    if (context.state !== "running" && context.state !== "closed")
      await context.resume();
  } catch {
    /* Audio is optional; never interrupt a message or draft. */
  }
}
export function playCommunityTone(): boolean {
  if (!context || context.state !== "running" || Date.now() - lastTone < 1800)
    return false;
  try {
    const start = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    gain.connect(context.destination);
    [659.25, 880].forEach((frequency, index) => {
      const tone = context!.createOscillator();
      tone.type = "sine";
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.onended = () => {
        tone.disconnect();
        if (index === 1) gain.disconnect();
      };
      tone.start(start + index * 0.13);
      tone.stop(start + 0.22 + index * 0.2);
    });
    lastTone = Date.now();
    return true;
  } catch {
    return false;
  }
}
