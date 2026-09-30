import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Connect, Plugin } from "vite";

// /install-bookmarklet is a static page (public/install-bookmarklet/index.html,
// see CLAUDE.md). Vercel serves a folder's index.html; Vite's dev/preview
// servers fall back to the SPA instead, so rewrite the bare folder path here.
const rewriteBookmarkletPage: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url && /^\/install-bookmarklet\/?(\?.*)?$/.test(req.url)) {
    req.url = req.url.replace(/^\/install-bookmarklet\/?/, "/install-bookmarklet/index.html");
  }
  next();
};
const staticBookmarkletPage: Plugin = {
  name: "static-bookmarklet-page",
  configureServer(server) {
    server.middlewares.use(rewriteBookmarkletPage);
  },
  configurePreviewServer(server) {
    server.middlewares.use(rewriteBookmarkletPage);
  },
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), staticBookmarkletPage, ...(mode === "mobile" ? [{
    name: "mobile-html",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string) {
        return html.replace(/\s*<!-- Google Analytics 4 -->[\s\S]*?(?=\s*<\/head>)/, "")
          .replace('content="width=device-width, initial-scale=1.0"', 'content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
      },
    },
  }] : [])],
  test: {
    environment: "node",
    setupFiles: ["./src/i18n/i18n.ts"],
    // Playwright specs live in e2e/ and run via `pnpm e2e`, not vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
}));
