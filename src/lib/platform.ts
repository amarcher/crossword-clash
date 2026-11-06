/**
 * Coarse platform sniffing for features that only make sense on one kind of
 * device. Kept tiny and injectable so it is unit-testable without a browser.
 */

/**
 * True when the visitor is on a desktop-class browser: a fine pointer (mouse
 * or trackpad) that can hover. That is the audience for the bookmarklet — it
 * needs a bookmarks bar and a `javascript:` URL, neither of which phones and
 * tablets offer — so bookmarklet promotion is hidden everywhere else rather
 * than sending touch users to a dead end.
 *
 * `matchMedia` is passed in so tests (and SSR) can supply their own.
 */
export function isDesktopBrowser(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = typeof window !== "undefined"
    ? window.matchMedia?.bind(window)
    : undefined,
): boolean {
  if (!matchMedia) return false;
  try {
    return matchMedia("(hover: hover) and (pointer: fine)").matches;
  } catch {
    return false;
  }
}

/** The App Store's Apple ID for the app (docs/testflight/README.md). */
export const IOS_APP_ID = "6811111993";

/**
 * The iOS app's App Store page (live since 2026-11-06, version 1.1.0). The
 * id-only form redirects to the visitor's own storefront. Safari also shows
 * Apple's Smart App Banner on every page (`apple-itunes-app` in index.html,
 * kept pointing at the current page by `syncSmartAppBanner`).
 */
export const IOS_APP_STORE_URL: string | null = `https://apps.apple.com/app/id${IOS_APP_ID}`;

/**
 * True in a browser on an iPhone or iPad — the audience for the "get the app"
 * row. iPadOS reports a Mac user agent, so touch points disambiguate it.
 */
export function isIosBrowser(
  nav: { userAgent: string; maxTouchPoints?: number } | undefined = typeof navigator !== "undefined"
    ? navigator
    : undefined,
): boolean {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/.test(nav.userAgent)) return true;
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * True only in Safari itself on an iPhone or iPad — the one browser that shows
 * Apple's Smart App Banner (the `apple-itunes-app` meta). Chrome, Firefox,
 * Edge, Opera, the Google app and in-app browsers (Instagram, Facebook, Gmail…)
 * ignore that tag, so `AppStoreBanner` draws our own there. Safari's user
 * agent carries `Version/` and `Safari/` and none of the other browsers'
 * tokens; an in-app web view usually lacks `Safari/` altogether.
 */
export function isIosSafari(
  nav: { userAgent: string; maxTouchPoints?: number } | undefined = typeof navigator !== "undefined"
    ? navigator
    : undefined,
): boolean {
  if (!nav || !isIosBrowser(nav)) return false;
  const ua = nav.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|YaBrowser|DuckDuckGo|FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Line\//.test(ua)) return false;
  return /Version\/[\d.]+/.test(ua) && /Safari\//.test(ua);
}

/**
 * The Android app's Google Play page (live since Oct 2026). The `referrer`
 * shows up in Play Console's acquisition report, so website-driven installs
 * can be told apart from store search.
 */
export const ANDROID_PLAY_STORE_URL: string | null =
  "https://play.google.com/store/apps/details?id=com.crosswordclash.app&referrer=utm_source%3Dwebsite%26utm_medium%3Dmenu";

/**
 * True in a browser on an Android phone or tablet that can reach Google Play —
 * the audience for the Android "get the app" row. Amazon Fire devices report
 * an Android user agent but ship without Play, so they are left out.
 */
export function isAndroidBrowser(
  nav: { userAgent: string } | undefined = typeof navigator !== "undefined" ? navigator : undefined,
): boolean {
  if (!nav) return false;
  if (!/Android/.test(nav.userAgent)) return false;
  return !/Silk\/|\bKF[A-Z]{2,}/.test(nav.userAgent);
}
