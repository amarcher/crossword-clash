import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept live. False where `matchMedia` is
 * missing (a server render, jsdom), so a layout that asks "is this a desktop?"
 * falls back to its phone arrangement there.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  const read = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  return useSyncExternalStore(subscribe, read, () => false);
}
