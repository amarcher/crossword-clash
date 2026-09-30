import i18n from "./i18n/i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { ConfirmProvider } from "./components/ConfirmDialog";
import { ConsentBanner } from "./components/ConsentBanner";
import { DeferredAnalytics } from "./components/DeferredAnalytics";
import "./index.css";
import { reloadOnceForChunkError } from "./lib/chunkReload";
import { initErrorReporting } from "./lib/errorReporting";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfirmProvider>
      <RouterProvider router={router} />
    </ConfirmProvider>
    <DeferredAnalytics />
    <ConsentBanner />
  </StrictMode>,
);
