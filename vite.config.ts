import fs from "node:fs";
import path, { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Connect, Plugin } from "vite";
import { prerender } from "./scripts/prerender/plugin";
import { PRERENDERED_ROUTES } from "./src/lib/pageMeta";

// Vercel serves a folder's index.html for its bare path; Vite's dev and
// preview servers fall back to the SPA instead. Rewrite the paths that have
// one: /install-bookmarklet (public/install-bookmarklet/index.html, see
// CLAUDE.md) everywhere, and in preview the prerendered content routes
// (dist/<route>/index.html, written by scripts/prerender/plugin.ts).
function folderIndexPages(root: string, folders: readonly string[]): Connect.NextHandleFunction {
  return (req, _res, next) => {
    const pathname = req.url?.replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (pathname && folders.includes(pathname) && fs.existsSync(resolve(root, pathname.slice(1), "index.html"))) {
      req.url = `${pathname}/index.html${req.url!.slice(pathname.length).replace(/^\/(?=\?|$)/, "")}`;
    }
    next();
  };
}
const staticFolderPages: Plugin = {
  name: "static-folder-pages",
  configureServer(server) {
    server.middlewares.use(folderIndexPages(resolve(server.config.root, "public"), ["/install-bookmarklet"]));
  },
  configurePreviewServer(server) {
    const dist = resolve(server.config.root, server.config.build.outDir);
    const prerendered = PRERENDERED_ROUTES.filter((r) => r !== "/");
    server.middlewares.use(folderIndexPages(dist, ["/install-bookmarklet", ...prerendered]));
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
  plugins: [react(), tailwindcss(), staticFolderPages, prerender({ plugins: [react(), tailwindcss()] }), ...studioPlugins(loadEnv(mode, process.cwd(), "VITE_")), ...(mode === "mobile" ? [{
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
