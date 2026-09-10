import { useCallback, useEffect, useRef, useState } from "react";
import type { CommunityMessage } from "./community";
import {
  CommunityArrivals,
  playCommunityTone,
  unlockCommunityAudio,
} from "./communitySound";

const PREFERENCE = "11drive:community-sound";
export function useCommunitySound(
  messages: CommunityMessage[],
  loading: boolean,
  alias?: string,
) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(PREFERENCE) !== "off";
    } catch {
      return true;
    }
  });
  const tracker = useRef(new CommunityArrivals());
  useEffect(() => {
    if (!enabled) return;
    const unlock = () => {
      void unlockCommunityAudio();
    };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [enabled]);
  useEffect(() => {
    if (loading) return;
    const incoming = tracker.current.observe(messages, alias);
    if (
      incoming &&
      enabled &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    )
      playCommunityTone();
  }, [messages, loading, alias, enabled]);
  const rememberOwn = useCallback(
    (id: string) => tracker.current.rememberOwn(id),
    [],
  );
  const toggle = () => {
    const next = !enabled;
    if (next) void unlockCommunityAudio();
    setEnabled(next);
    try {
      localStorage.setItem(PREFERENCE, next ? "on" : "off");
    } catch {
      /* Private browsing. */
    }
  };
  return { enabled, toggle, rememberOwn };
}
