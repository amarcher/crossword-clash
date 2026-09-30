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
