/**
 * Per-route `<title>` / description / canonical, the one source of truth for
 * both the build-time prerender (which writes them into each page's `<head>`,
 * see scripts/prerender) and the client (which applies them on every
 * navigation, see main.tsx). Keeping them in one table is what keeps the
 * static HTML and the live document in sync.
 *
 * Routes not listed here show the site defaults (the home page's), which is
 * what the static index.html carried before any of this existed.
 */

export const SITE_ORIGIN = "https://crosswordclash.com";

export interface PageMeta {
  title: string;
  description: string;
  /** Absolute canonical URL. */
  canonical: string;
}

/** The content routes the build prerenders. Order is the order of output. */
export const PRERENDERED_ROUTES = ["/", "/menu", "/privacy", "/terms", "/support", "/copyright"] as const;
export type PrerenderedRoute = (typeof PRERENDERED_ROUTES)[number];

type Translate = (key: string) => string;

/** `/menu` is the same page as `/`, so it points search engines at `/`. */
function canonicalFor(pathname: string): string {
  if (pathname === "/" || pathname === "/menu") return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${pathname}`;
}

/** Meta for a pathname. Unknown routes get the home page's meta. */
export function pageMetaFor(pathname: string, t: Translate): PageMeta {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  // The community list, an author's list and a puzzle's page share the list's meta (the page sets its own title once loaded).
  if (path === "/puzzles" || path.startsWith("/puzzles/")) {
    return { title: t("meta.community.title"), description: t("meta.community.description"), canonical: canonicalFor("/puzzles") };
  }
  if (path === "/race" || path.startsWith("/race/")) {
    return { title: t("meta.race.title"), description: t("meta.race.description"), canonical: canonicalFor("/race") };
  }
  switch (path) {
    case "/archive":
      return { title: t("meta.archive.title"), description: t("meta.archive.description"), canonical: canonicalFor(path) };
    case "/account":
      return { title: t("meta.account.title"), description: t("meta.account.description"), canonical: canonicalFor(path) };
    case "/privacy":
    case "/terms":
    case "/support":
    case "/copyright": {
      const kind = path.slice(1);
      return {
        title: `${t(`legal.${kind}Title`)} | Crossword Clash`,
        description: t(`meta.${kind}.description`),
        canonical: canonicalFor(path),
      };
    }
    case "/menu":
      return { title: t("meta.home.title"), description: t("meta.home.description"), canonical: canonicalFor(path) };
    default:
      return { title: t("meta.home.title"), description: t("meta.home.description"), canonical: canonicalFor("/") };
  }
}

/** The head tags a PageMeta drives, as [attribute, name, content] so one loop serves both the prerender and the client. */
export function metaTags(meta: PageMeta): [attr: "name" | "property", name: string, content: string][] {
  return [
    ["name", "description", meta.description],
    ["property", "og:title", meta.title],
    ["property", "og:description", meta.description],
    ["property", "og:url", meta.canonical],
    ["name", "twitter:title", meta.title],
    ["name", "twitter:description", meta.description],
  ];
}

/** Write a PageMeta into a live document (title, description, canonical, OG and Twitter copies). */
export function applyPageMeta(meta: PageMeta, doc: Document = document): void {
  if (doc.title !== meta.title) doc.title = meta.title;
  for (const [attr, name, content] of metaTags(meta)) {
    const el = doc.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
    if (el && el.getAttribute("content") !== content) el.setAttribute("content", content);
  }
  const canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (canonical && canonical.getAttribute("href") !== meta.canonical) canonical.setAttribute("href", meta.canonical);
}
