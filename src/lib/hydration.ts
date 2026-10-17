import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * False during the server render and during the client's hydration pass, true
 * on every later render (and immediately in a plain client render).
 *
 * The prerendered content routes (see scripts/prerender) are hydrated by the
 * same bundle, so anything a component reads synchronously from the browser
 * during render — localStorage, matchMedia, navigator — must resolve to the
 * server's value first or React discards the HTML and re-renders from scratch.
 * `useSyncExternalStore` with a server snapshot is React's own mechanism for
 * exactly that: hydration uses the server snapshot, then React re-renders
 * with the client one.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, clientSnapshot, serverSnapshot);
}
