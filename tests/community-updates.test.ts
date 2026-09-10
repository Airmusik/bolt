import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CommunityArrivals,
  playCommunityTone,
  unlockCommunityAudio,
} from "../src/lib/communitySound.ts";
import type { CommunityMessage } from "../src/lib/community.ts";

const row = (
  id: string,
  time = 1,
  overrides: Partial<CommunityMessage> = {},
): CommunityMessage => ({
  id,
  alias: "Member other",
  member_role: "driver",
  body: "Hello",
  created_at: new Date(time * 60000).toISOString(),
  removed: false,
  filtered: false,
  ...overrides,
});
test("community tones exclude initial history, pagination, own sends, repeats and moderation edits", () => {
  const arrivals = new CommunityArrivals();
  assert.equal(arrivals.observe([row("a")]), false);
  assert.equal(arrivals.observe([row("earlier", 0), row("a")]), false);
  assert.equal(arrivals.observe([row("b", 2)]), true);
  assert.equal(arrivals.observe([row("b", 2)]), false);
  assert.equal(arrivals.observe([row("b", 2, { removed: true })]), false);
  arrivals.rememberOwn("support-own");
  assert.equal(
    arrivals.observe([row("support-own", 3, { member_role: "admin" })]),
    false,
  );
  assert.equal(
    arrivals.observe(
      [row("alias-own", 4, { alias: "Member me", member_role: "member" })],
      "Member me",
    ),
    false,
  );
  assert.equal(
    arrivals.observe([row("other-support", 5, { member_role: "admin" })]),
    true,
  );
  assert.equal(arrivals.observe([row("fallback-new", 6)]), true);
  assert.equal(
    arrivals.observe([row("already-removed", 7, { removed: true })]),
    false,
  );
});
test("empty initial room is silent; first actual incoming message rings", () => {
  const arrivals = new CommunityArrivals();
  assert.equal(arrivals.observe([]), false);
  assert.equal(arrivals.observe([row("first")]), true);
});
test("sound requires unlocked audio and throttles rapid arrivals", async () => {
  let starts = 0;
  class FakeAudio {
    state = "suspended";
    currentTime = 0;
    destination = {};
    async resume() {
      this.state = "running";
    }
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        disconnect() {},
      };
    }
    createOscillator() {
      return {
        type: "",
        frequency: { value: 0 },
        connect() {},
        disconnect() {},
        start() {
          starts++;
        },
        stop() {},
        onended: null,
      };
    }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioContext: FakeAudio },
  });
  try {
    assert.equal(playCommunityTone(), false);
    await unlockCommunityAudio();
    assert.equal(playCommunityTone(), true);
    assert.equal(starts, 2);
    assert.equal(playCommunityTone(), false);
    assert.equal(starts, 2);
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
test("mobile room uses full visual viewport without remounting and keeps an exit", () => {
  const frame = readFileSync("src/components/CommunityFrame.tsx", "utf8");
  const css = readFileSync("src/styles/community.css", "utf8");
  const room = readFileSync("src/components/CommunityRoom.tsx", "utf8");
  assert.match(frame, /visualViewport/);
  assert.match(frame, /removeEventListener\(["']resize["']/);
  assert.match(css, /height: var\(--community-viewport-height, 100dvh\)/);
  assert.match(
    css,
    /\.community-page \.community-room \{\s*height: 100%;\s*min-height: 0/,
  );
  assert.match(room, /Back from community/);
  assert.match(room, /disabled=\{sending \|\| !session.member_alias\}/);
});
