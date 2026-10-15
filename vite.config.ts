import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
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

// /studio is dev-only unless VITE_STUDIO=1. Vite still emits its worker and wasm
// (worker assets are written before tree-shaking), and copies the gitignored
// public/seedgrid/ word list if one exists locally; drop both from other builds
// so they never reach Vercel or the native app bundles.
const STUDIO_ASSET = /^assets\/(engine\.worker|seedgrid_engine_bg)-/;
const dropStudioAssets: Plugin = {
  name: "drop-studio-assets",
  apply: "build",
  generateBundle(_options, bundle) {
    for (const fileName of Object.keys(bundle)) if (STUDIO_ASSET.test(fileName)) delete bundle[fileName];
  },
  writeBundle(options) {
    if (options.dir) fs.rmSync(path.join(options.dir, "seedgrid"), { recursive: true, force: true });
  },
};

// Studio builds load the licensable list from Supabase Storage. The full list
// (FrequencyWords scoring) is for private use, so it ships only when asked for
// by name with VITE_SEEDGRID_WORD_LIST=/seedgrid/words.dict.
const dropPrivateWordList: Plugin = {
  name: "drop-private-word-list",
  apply: "build",
  writeBundle(options) {
    if (options.dir) fs.rmSync(path.join(options.dir, "seedgrid", "words.dict"), { force: true });
  },
};

function studioPlugins(env: Record<string, string>): Plugin[] {
  if (env.VITE_STUDIO !== "1") return [dropStudioAssets];
  return env.VITE_SEEDGRID_WORD_LIST === "/seedgrid/words.dict" ? [] : [dropPrivateWordList];
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), staticBookmarkletPage, ...studioPlugins(loadEnv(mode, process.cwd(), "VITE_")), ...(mode === "mobile" ? [{
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
