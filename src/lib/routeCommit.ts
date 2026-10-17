/**
 * A tiny signal for "the router's new location has been committed to the DOM".
 *
 * `navigate(to, { flushSync: true })` resolves once the router has pushed the
 * location and asked React for a synchronous commit, but the FIRST render of a
 * route's component still lands a few milliseconds later (measured: pushState
 * at +23 ms, the new heading in the DOM at +27 ms). A view transition that
 * captures its "new" snapshot in between cross-fades the old page into itself.
 * SiteFrame calls `signalRouteCommit` from a layout effect keyed on the
 * location, which runs after the DOM mutation and before paint, so awaiting
 * `nextRouteCommit` after `navigate` guarantees the capture sees the new page.
 */

/** Upper bound on the wait, so a navigation that never changes the location cannot hang a transition. */
export const ROUTE_COMMIT_TIMEOUT_MS = 300;

let waiters: Array<() => void> = [];

/** Called after every committed location change. */
export function signalRouteCommit(): void {
  const pending = waiters;
  waiters = [];
  pending.forEach((resolve) => resolve());
}

/** Resolves on the next committed location change, or after the timeout. */
export function nextRouteCommit(timeoutMs = ROUTE_COMMIT_TIMEOUT_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      waiters = waiters.filter((w) => w !== done);
      resolve();
    }
    waiters.push(done);
  });
}
