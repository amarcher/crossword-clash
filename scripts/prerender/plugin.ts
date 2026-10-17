/**
 * Vite plugin: after the client build, render the content routes to static
 * HTML so crawlers (and the AdSense reviewer) get real markup instead of an
 * empty #root. See docs/prerender-spike.md for the why and the trade-offs.
 *
 * How: a second, SSR-mode Vite build of src/entry-server.tsx into
 * dist/.ssr (so the route modules run in Node with the same env, JSON and
 * asset handling as the client bundle), one renderToString per route, then
 * each result is spliced into the built index.html (src/lib/prerender.ts) and
 * written to dist/<route>/index.html. dist/.ssr is removed afterwards.
 *
 * Skipped for `--mode mobile`: the Capacitor apps load dist/index.html from
 * disk with an empty #root and take main.tsx's plain createRoot path.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin, PluginOption, ResolvedConfig } from "vite";
import { CLASSIC_MANIFEST_SCRIPT_ID, parseManifest } from "../../src/lib/classicLibrary";
import { PRERENDERED_ROUTES } from "../../src/lib/pageMeta";
import { buildPage, outputPathFor } from "../../src/lib/prerender";

type ServerEntry = typeof import("../../src/entry-server");

export interface PrerenderOptions {
  /** Plugins the SSR build needs (React, Tailwind). Never this plugin itself. */
  plugins: PluginOption[];
}

export function prerender({ plugins }: PrerenderOptions): Plugin {
  let config: ResolvedConfig;
  return {
    name: "prerender-content-routes",
    apply: (_config, env) => env.command === "build" && !env.isSsrBuild && env.mode !== "mobile",
    configResolved(resolved) {
      config = resolved;
    },
    async closeBundle() {
      const outDir = resolve(config.root, config.build.outDir);
      const ssrDir = resolve(outDir, ".ssr");
      const started = Date.now();
      const { build } = await import("vite");
      await build({
        configFile: false,
        root: config.root,
        mode: config.mode,
        logLevel: "warn",
        plugins,
        build: { ssr: "src/entry-server.tsx", outDir: ssrDir, emptyOutDir: true, minify: false, sourcemap: false },
        // Bundle dependencies too: several are CommonJS (lz-string, the puzzle
        // parser) and Node's ESM loader cannot see their named exports.
        ssr: { noExternal: true },
      });
      try {
        const entry = (await import(pathToFileURL(resolve(ssrDir, "entry-server.js")).href)) as ServerEntry;
        const template = await readFile(resolve(outDir, "index.html"), "utf8");
        const classics = parseManifest(JSON.parse(await readFile(resolve(config.root, "public/classic-puzzles/manifest.json"), "utf8")));
        for (const route of PRERENDERED_ROUTES) {
          const { html, meta } = await entry.render(route, { classics });
          const data = route === "/classics" ? { [CLASSIC_MANIFEST_SCRIPT_ID]: classics } : undefined;
          const file = resolve(outDir, outputPathFor(route));
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, buildPage(template, { route, html, meta, data }));
        }
      } finally {
        await rm(ssrDir, { recursive: true, force: true });
      }
      config.logger.info(`prerendered ${PRERENDERED_ROUTES.length} routes in ${Date.now() - started}ms`);
    },
  };
}
