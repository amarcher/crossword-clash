import type { NavigateFunction, NavigateOptions } from "react-router";
import { prefetchRoute } from "../routeModules";
import { nextRouteCommit } from "./routeCommit";
import { canViewTransition, withViewTransition } from "./viewTransition";

/**
 * How long to wait for a route's chunk before giving up on the cross-fade.
 * The page is frozen on the old snapshot while a view transition's update
 * callback runs, so a transition must not be started around a chunk download:
 * on a slow network that would freeze input for seconds with no feedback. A
 * chunk warmed by prefetch-on-intent, or small enough to arrive within this
 * budget, gets the fade; anything slower gets the plain navigation and the
 * pending bar after its own 150 ms.
 */
export const TRANSITION_WAIT_MS = 150;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Navigate inside a root cross-fade (`::view-transition-*(root)` in index.css),
 * holding any element named `site-bar` / `brand` still or morphing it.
 *
 * React Router v7 wraps its state updates in `React.startTransition`, so the
 * router's own `{ flushSync: true }` (which needs the RouterProvider from
 * `react-router/dom`) is the only way to have the new route committed before
 * the transition captures its "new" snapshot — and the navigation must be
 * awaited, because the router resolves it asynchronously even with no loaders.
 * Even then a route's FIRST render commits a few milliseconds after `navigate`
 * resolves, so the update also waits for SiteFrame's commit signal.
 */
export async function navigateWithTransition(
  navigate: NavigateFunction,
  to: string,
  options: NavigateOptions = {},
): Promise<void> {
  const chunk = prefetchRoute(to);
  if (!canViewTransition()) {
    await navigate(to, options);
    return;
  }
  if (chunk) {
    const loaded = await Promise.race([
      chunk.then(
        () => true,
        () => false,
      ),
      wait(TRANSITION_WAIT_MS).then(() => false),
    ]);
    if (!loaded) {
      await navigate(to, options);
      return;
    }
  }
  await withViewTransition(async () => {
    const committed = nextRouteCommit();
    await navigate(to, { ...options, flushSync: true });
    await committed;
  });
}
