import i18n from "./i18n/i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { DeferredAnalytics } from "./components/DeferredAnalytics";
import "./index.css";
import { router } from "./router";

// Keep <html lang> in sync with the active language
document.documentElement.lang = i18n.language;
i18n.on("languageChanged", (lng) => {
  document.documentElement.lang = lng;
});

// Recover from stale code-split chunks after a redeploy. A long-lived client
// holds an old index.html referencing chunk hashes that no longer exist on the
// server; the lazy import 404s (or gets index.html back as text/html), which
// Vite reports via `vite:preloadError`. Reloading fetches the fresh index.html
// with current hashes. Guard against a reload loop (a genuinely broken deploy)
// by only reloading once per short window.
window.addEventListener("vite:preloadError", (event) => {
  const KEY = "crossword-clash:chunk-reload";
  const now = Date.now();
  const last = Number(sessionStorage.getItem(KEY) ?? 0);
  // If we already reloaded within the last 10s, don't loop — let the error surface.
  if (now - last < 10_000) return;
  event.preventDefault();
  sessionStorage.setItem(KEY, String(now));
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <DeferredAnalytics />
  </StrictMode>,
);
