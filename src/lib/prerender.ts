/**
 * Pure helpers for the build-time prerender (scripts/prerender/plugin.ts):
 * where a route's static page goes, how the rendered markup and per-route head
 * tags are spliced into the built index.html, and the inline guard that keeps
 * a visitor from hydrating markup that is not for them. Kept free of Node and
 * DOM so vitest can cover them.
 */
import { metaTags, type PageMeta } from "./pageMeta";

/** Marks `#root` as prerendered, with the route it was rendered for; main.tsx hydrates only when it matches. */
export const PRERENDERED_ATTR = "data-prerendered";

/** The pathname as the guard script and main.tsx compare it: no trailing slash, "/" for the root. */
export function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

/** `/classics` → `classics/index.html`; `/` → `index.html` (Vercel and `vite preview` serve a folder's index). */
export function outputPathFor(route: string): string {
  const trimmed = route.replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/index.html` : "index.html";
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** JSON safe to place inside a `<script>` (no `</script>` or `<!--` can form). */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/**
 * The inline script a prerendered page runs right after `#root`, before the
 * bundle: it empties `#root` when the visitor should get a plain client render
 * instead of hydrating this markup, which is English and shows the menu.
 *
 * - The page is being served for another path: Vercel's SPA catch-all answers
 *   every unknown route (/solo/play, /play/:id, …) with index.html, which is
 *   now the prerendered home page. Those routes must start from an empty #root
 *   as they always did, with no glimpse of the menu.
 * - A stored or browser language other than English (mirrors detectLanguage()
 *   in src/i18n/i18n.ts): the client renders Spanish from the start.
 * - On `/` only, any state IndexRedirect sends elsewhere: a `#puzzle=` or
 *   `#import` hash, `?join=`, a saved multiplayer or solo session. Those
 *   visitors never see the menu, so they must not see its HTML either.
 *
 * Everything is wrapped in try/catch: with storage blocked the markup stays and
 * hydration proceeds, which is also what the bundle would decide.
 */
export function guardScript(route: string): string {
  const redirectChecks =
    route === "/"
      ? `||location.hash.indexOf("#puzzle=")===0||location.hash==="#import"||/[?&]join=/.test(location.search)||localStorage.getItem("crossword-clash-mp")||localStorage.getItem("crossword-clash-solo")`
      : "";
  return (
    `(function(){try{var p=location.pathname.replace(/\\/+$/,"")||"/",l=localStorage.getItem("crossword-clash:language")||(navigator.language||"").slice(0,2);` +
    `if(p!==${JSON.stringify(route)}||(l&&l!=="en"&&["es"].indexOf(l)>=0)${redirectChecks})document.getElementById("root").replaceChildren()}catch(e){}})()`
  );
}

export interface PageParts {
  route: string;
  /** Inner HTML for `#root`. */
  html: string;
  meta: PageMeta;
  /** Extra JSON data the page carries for the client's first render, by script id. */
  data?: Record<string, unknown>;
}

function replaceOnce(html: string, pattern: RegExp, replacement: string, what: string): string {
  if (!pattern.test(html)) throw new Error(`prerender: index.html has no ${what}`);
  return html.replace(pattern, replacement);
}

/** Splice a rendered route into the built index.html template. */
export function buildPage(template: string, parts: PageParts): string {
  const { route, html, meta } = parts;
  let out = replaceOnce(template, /<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(meta.title)}</title>`, "<title>");
  out = replaceOnce(out, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`, "canonical link");
  for (const [attr, name, content] of metaTags(meta)) {
    out = replaceOnce(out, new RegExp(`<meta ${attr}="${name}"[^>]*>`), `<meta ${attr}="${name}" content="${escapeHtml(content)}" />`, `meta ${name}`);
  }
  const data = Object.entries(parts.data ?? {})
    .map(([id, value]) => `<script type="application/json" id="${escapeHtml(id)}">${scriptJson(value)}</script>`)
    .join("\n    ");
  const root =
    `<div id="root" ${PRERENDERED_ATTR}="${escapeHtml(route)}">${html}</div>` +
    (data ? `\n    ${data}` : "") +
    `\n    <script>${guardScript(route)}</script>`;
  return replaceOnce(out, /<div id="root"><\/div>/, root, 'empty <div id="root">');
}
