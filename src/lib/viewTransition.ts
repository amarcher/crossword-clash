/**
 * A thin, safe wrapper around the View Transitions API.
 *
 * `document.startViewTransition` snapshots the page, runs `update`, snapshots
 * again and cross-fades between the two (elements with a `view-transition-name`
 * get their own group and morph instead). The wrapper feature-detects, skips
 * under prefers-reduced-motion, and swallows all three of the transition's
 * rejectable promises: a skipped or interrupted transition rejects at least one
 * of them, and an unhandled rejection is a console error even when the page
 * looks right.
 */
export function canViewTransition(): boolean {
  if (typeof document === "undefined" || typeof document.startViewTransition !== "function") return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

const swallow = () => {};

/** Runs `update` inside a view transition when possible, else plainly. Resolves once the DOM update is done. */
export async function withViewTransition(update: () => void | Promise<void>): Promise<void> {
  if (!canViewTransition()) {
    await update();
    return;
  }
  const transition = document.startViewTransition(update);
  transition.ready.catch(swallow);
  transition.finished.catch(swallow);
  // If the update itself threw, the caller still gets a settled promise; the
  // transition is skipped and the DOM is whatever `update` left behind.
  await transition.updateCallbackDone.catch(swallow);
}
