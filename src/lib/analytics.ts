/**
 * Thin wrapper over Google Analytics 4 (gtag.js, configured in index.html).
 *
 * Two reasons this exists:
 *  1. The app is a single-page app (createBrowserRouter). gtag only fires a
 *     `page_view` on the very first HTML load, so without manual tracking GA4
 *     sees one pageview per session and nothing after. `trackPageView()` (wired
 *     in RootLayout/HostLayout) restores per-route pageviews.
 *  2. GA4 has no behavioral events for this app. `track()` emits the funnel
 *     events (import → play → complete → multiplayer → narrator) so we can
 *     actually answer "what are people playing and do they use the narrator?".
 *
 * No-ops safely when gtag is absent (dev without the GA script, tests, or an
 * ad-blocker). Never throws.
 */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    dataLayer?: unknown[];
  }
}

/** Funnel events. Keep names snake_case and stable — renaming orphans history. */
export type AnalyticsEvent =
  | "puzzle_imported"
  | "mode_selected"
  | "game_started"
  | "puzzle_completed"
  | "narrator_enabled"
  | "language_changed"
  | "result_shared"
  | "challenge_created"
  | "challenge_accepted"
  | "live_bridge";

type EventParams = Record<string, string | number | boolean | undefined>;

function gtag(): GtagFn | undefined {
  if (typeof window === "undefined") return undefined;
  return window.gtag;
}

/**
 * Emit a custom GA4 event. Undefined params are dropped so callers can pass
 * optional fields without guarding each one.
 */
export function track(event: AnalyticsEvent, params: EventParams = {}): void {
  const g = gtag();
  if (!g) return;
  const clean: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) clean[k] = v;
  }
  try {
    g("event", event, clean);
  } catch {
    // Analytics must never break the app.
  }
}

/** Manually report an SPA route change as a GA4 page_view. */
export function trackPageView(path: string): void {
  const g = gtag();
  if (!g) return;
  try {
    g("event", "page_view", {
      page_path: path,
      page_location: typeof window !== "undefined" ? window.location.href : path,
    });
  } catch {
    // ignore
  }
}
