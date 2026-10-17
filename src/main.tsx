import i18n from "./i18n/i18n";
import { createRoot, hydrateRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { AppShell } from "./AppShell";
import "./index.css";
import { reloadOnceForChunkError } from "./lib/chunkReload";
import { initErrorReporting, reportError } from "./lib/errorReporting";
import { applyPageMeta, pageMetaFor } from "./lib/pageMeta";
import { normalizePathname } from "./lib/prerender";
import { router } from "./router";
import { Capacitor } from "@capacitor/core";

document.documentElement.classList.toggle("native-app", Capacitor.isNativePlatform());

// Keep <html lang> in sync with the active language
document.documentElement.lang = i18n.language;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

// Recover from stale code-split chunks after a redeploy: an old tab references
// chunk hashes that no longer exist, so the lazy import fails (Vite reports it
// via `vite:preloadError`). Reload once — guarded by a sessionStorage timestamp
// so a genuinely broken deploy can't loop; RouteErrorScreen covers the same
// failure when it surfaces through the router instead.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForChunkError()) event.preventDefault();
});

initErrorReporting();

// <title>, description and canonical per route — the same table the
// build-time prerender writes into each static page's <head>.
const syncPageMeta = () => applyPageMeta(pageMetaFor(router.state.location.pathname, (key) => i18n.t(key)));
router.subscribe(syncPageMeta);
i18n.on("languageChanged", syncPageMeta);
syncPageMeta();

const app = (
  <AppShell>
    <RouterProvider router={router} />
  </AppShell>
);

const rootEl = document.getElementById("root")!;

// The content routes ship as prerendered HTML (scripts/prerender). When this
// page is one of them, and the inline guard in that page kept its markup
// (same route, English, no pending redirect), take the HTML over with
// hydrateRoot instead of rendering from scratch — no blank frame, no duplicate
// render. Everywhere else (game routes, the native apps, dev) #root is empty
// and this is the plain client render it always was. The guard already
// applied these checks before the bundle loaded; repeating them here is cheap.
const prerendered =
  rootEl.hasChildNodes() &&
  rootEl.dataset.prerendered === normalizePathname(window.location.pathname) &&
  i18n.language === "en";

if (prerendered) {
  // Lazy route modules must be loaded before hydration, or RouterProvider
  // renders nothing and React discards the HTML. The static page stays visible
  // while they load.
  const whenInitialized = router.state.initialized
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        const unsubscribe = router.subscribe((state) => {
          if (state.initialized) {
            unsubscribe();
            resolve();
          }
        });
      });
  void whenInitialized.then(() => {
    if (import.meta.env.DEV) console.info(`hydrating prerendered ${rootEl.dataset.prerendered}`);
    hydrateRoot(rootEl, app, {
      onRecoverableError(error) {
        // A mismatch means React re-rendered that part client-side; the page
        // still works, but it is a bug in the prerender's determinism.
        reportError(error, { source: "hydration", route: rootEl.dataset.prerendered });
      },
    });
  });
} else {
  rootEl.replaceChildren();
  createRoot(rootEl).render(app);
}
