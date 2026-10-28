import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept current as the viewport changes.
 * False on the server and anywhere without `matchMedia` (jsdom), so a
 * prerendered page and its first client render agree.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = typeof window !== "undefined" ? window.matchMedia?.(query) : undefined;
      if (!mql) return () => {};
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  const read = useCallback(() => (typeof window !== "undefined" && !!window.matchMedia?.(query).matches), [query]);
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Tailwind's `lg` breakpoint (64rem) — the width at which pages spread out. */
export const LG_QUERY = "(min-width: 64rem)";
