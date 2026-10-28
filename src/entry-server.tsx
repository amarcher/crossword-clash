/**
 * Build-time prerender entry (not shipped to browsers). The prerender plugin
 * (scripts/prerender/plugin.ts) builds this file in Vite's SSR mode, imports
 * the result in Node and calls `render()` once per content route; the HTML it
 * returns goes inside `#root` of that route's static page, which main.tsx then
 * hydrates. Only routes whose first render is deterministic belong here (see
 * docs/prerender-spike.md); game screens stay client-only.
 */
import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router";
import { AppShell } from "./AppShell";
import { routes } from "./routes";
import { pageMetaFor, type PageMeta } from "./lib/pageMeta";
import i18n from "./i18n/i18n";

export interface Rendered {
  /** Inner HTML for `#root`. */
  html: string;
  meta: PageMeta;
}

const handler = createStaticHandler(routes);

export async function render(pathname: string): Promise<Rendered> {
  const request = new Request(`https://crosswordclash.com${pathname}`);
  // Resolves the matched routes' `lazy` modules and runs any loaders.
  const context = await handler.query(request);
  if (context instanceof Response) throw new Error(`${pathname} redirected or errored during prerender (${context.status})`);
  const router = createStaticRouter(handler.dataRoutes, context);
  const html = renderToString(
    <AppShell>
      {/* hydrate={false}: no loaders, so no hydration data script to inject. */}
      <StaticRouterProvider router={router} context={context} hydrate={false} />
    </AppShell>,
  );
  return { html, meta: pageMetaFor(pathname, (key) => i18n.t(key)) };
}
