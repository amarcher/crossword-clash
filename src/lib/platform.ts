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

/**
 * The iOS app's App Store page, or null while the app is not yet released.
 * Set this once Apple approves the app; until then the website shows no app
 * promotion. (Then also add the Smart App Banner meta tag to index.html:
 * `<meta name="apple-itunes-app" content="app-id=6811111993">`.)
 */
export const IOS_APP_STORE_URL: string | null = null;

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
