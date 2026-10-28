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
  /** Param `import_source` (file | url | bookmarklet | classic) — never `source`: GA4 treats `source`/`medium`/`campaign` event params as traffic-source overrides, which relabelled Bing sessions as "classic". */
  | "puzzle_imported"
  | "mode_selected"
  | "game_started"
  | "puzzle_completed"
  | "narrator_enabled"
  | "language_changed"
  | "result_shared"
  | "challenge_created"
  | "challenge_accepted"
  | "live_bridge"
  | "leaderboard_viewed"
  /** A website visitor on iOS followed the App Store link. Param `placement`. */
  | "app_store_click"
  /** A website visitor on Android followed the Google Play link. Param `placement`. */
  | "play_store_click"
  /**
   * Fired from the STATIC /install-bookmarklet page (bookmarklet/install-page.html
   * has its own gtag snippet — it is outside the React bundle by design).
   * Listed here so the event vocabulary stays in one place. Param `method`:
   * "drag" | "contextmenu" | "click".
   */
  | "bookmarklet_install_intent"
  /** A solver tapped a provider in the account sheet. Params `provider`, `placement`. */
  | "account_sign_in_started"
  /** A signed-in solver saved a username (first pick or a change). Param `first`. */
  | "username_saved"
  /** A signed-in solver deleted their account. */
  | "account_deleted"
  /** The Plus pitch was shown. Params `placement`, `feature` (archive | studio | narrator | …). */
  | "paywall_viewed"
  /** A visitor tapped a plan. Params `channel` (stripe | revenuecat), `plan` (monthly | annual), `placement`. */
  | "checkout_started"
  /** A purchase went through (the Checkout return, or the store sheet). Params `channel`, `plan`. */
  | "purchase_completed"
  /** "Restore purchases" in the app found an entitlement. */
  | "purchase_restored"
  /** A studio author published (or updated) a community puzzle. Params `size`, `difficulty`, `lang`, `update`. */
  | "puzzle_published"
  /** An author took a community puzzle down. */
  | "puzzle_unpublished"
  /** A player reported a community puzzle. Param `reason`. */
  | "puzzle_reported"
  /** A player hid an author's puzzles on this device. */
  | "author_hidden"
  /** The apps' "update available" banner was shown. Param `version` (the store's version name, or Play's version code). */
  | "app_update_shown"
  /** The player tapped Update on that banner. Param `version`. */
  | "app_update_tapped"
  /** The player tapped Later on that banner. Param `version`. */
  | "app_update_dismissed";

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
