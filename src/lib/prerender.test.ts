import { describe, expect, it } from "vitest";
import { PRERENDERED_ATTR, buildPage, escapeHtml, guardScript, normalizePathname, outputPathFor, scriptJson } from "./prerender";
import type { PageMeta } from "./pageMeta";

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <title>Crossword Clash — Real-Time Multiplayer Crossword Puzzles</title>
    <meta name="description" content="home" />
    <link rel="canonical" href="https://crosswordclash.com/" />
    <meta property="og:url" content="https://crosswordclash.com/" />
    <meta property="og:title" content="home" />
    <meta property="og:description" content="home" />
    <meta name="twitter:title" content="home" />
    <meta name="twitter:description" content="home" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index-abc.js"></script>
  </body>
</html>`;

const meta: PageMeta = {
  title: 'Archive <"2026"> & more',
  description: "Forty-six puzzles",
  canonical: "https://crosswordclash.com/archive",
};

describe("outputPathFor", () => {
  it("maps the home page to index.html and every other route to a folder index", () => {
    expect(outputPathFor("/")).toBe("index.html");
    expect(outputPathFor("/archive")).toBe("archive/index.html");
    expect(outputPathFor("/daily/leaderboard/")).toBe("daily/leaderboard/index.html");
  });
});

describe("buildPage", () => {
  it("splices the markup into #root, marks it prerendered and appends the guard script", () => {
    const html = buildPage(TEMPLATE, { route: "/archive", html: "<ul><li>A</li></ul>", meta });
    expect(html).toContain(`<div id="root" ${PRERENDERED_ATTR}="/archive"><ul><li>A</li></ul></div>`);
    expect(html).toContain(`<script>${guardScript("/archive")}</script>`);
    // The bundle still loads after the markup.
    expect(html.indexOf("</ul></div>")).toBeLessThan(html.indexOf('<script type="module"'));
  });

  it("rewrites the head from the page meta, escaped", () => {
    const html = buildPage(TEMPLATE, { route: "/archive", html: "", meta });
    expect(html).toContain("<title>Archive &lt;&quot;2026&quot;&gt; &amp; more</title>");
    expect(html).toContain('<meta name="description" content="Forty-six puzzles" />');
    expect(html).toContain('<meta property="og:title" content="Archive &lt;&quot;2026&quot;&gt; &amp; more" />');
    expect(html).toContain('<link rel="canonical" href="https://crosswordclash.com/archive" />');
    expect(html).toContain('<meta property="og:url" content="https://crosswordclash.com/archive" />');
    expect(html).not.toContain('content="home"');
  });

  it("embeds page data as JSON scripts that cannot close themselves", () => {
    const html = buildPage(TEMPLATE, {
      route: "/archive",
      html: "",
      meta,
      data: { "daily-index": [{ title: "</script><script>alert(1)</script>" }] },
    });
    expect(html).toContain('<script type="application/json" id="daily-index">');
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\\u003c/script>");
  });

  it("refuses a template that lost one of the tags it rewrites", () => {
    expect(() => buildPage(TEMPLATE.replace(/<link rel="canonical"[^>]*>/, ""), { route: "/", html: "", meta })).toThrow(/canonical/);
    expect(() => buildPage(TEMPLATE.replace('<div id="root"></div>', "<div id=root></div>"), { route: "/", html: "", meta })).toThrow(/root/);
  });
});

describe("guardScript", () => {
  /** Run the guard against a fake browser; returns whether #root was cleared. */
  function cleared(route: string, env: { pathname?: string; hash?: string; search?: string; stored?: Record<string, string>; language?: string }) {
    let wiped = false;
    const stored = env.stored ?? {};
    const sandbox = {
      location: { pathname: env.pathname ?? route, hash: env.hash ?? "", search: env.search ?? "" },
      localStorage: { getItem: (k: string) => stored[k] ?? null },
      navigator: { language: env.language ?? "en-US" },
      document: { getElementById: () => ({ replaceChildren: () => void (wiped = true) }) },
    };
    new Function(...Object.keys(sandbox), guardScript(route))(...Object.values(sandbox));
    return wiped;
  }

  it("keeps the markup for an English visitor on the route it was rendered for", () => {
    expect(cleared("/", {})).toBe(false);
    expect(cleared("/archive", { pathname: "/archive/" })).toBe(false);
    expect(cleared("/privacy", { stored: { "crossword-clash:language": "en" }, language: "es-ES" })).toBe(false);
  });

  it("clears it when the SPA catch-all served this page for another path", () => {
    expect(cleared("/", { pathname: "/solo/play" })).toBe(true);
    expect(cleared("/", { pathname: "/play/abc" })).toBe(true);
  });

  it("clears it for Spanish visitors, stored or detected", () => {
    expect(cleared("/archive", { stored: { "crossword-clash:language": "es" } })).toBe(true);
    expect(cleared("/archive", { language: "es-MX" })).toBe(true);
    // An unsupported browser language falls back to English, like detectLanguage().
    expect(cleared("/archive", { language: "fr-FR" })).toBe(false);
  });

  it("clears it on / for every state IndexRedirect sends elsewhere, and only there", () => {
    expect(cleared("/", { hash: "#puzzle=abc" })).toBe(true);
    expect(cleared("/", { hash: "#import" })).toBe(true);
    expect(cleared("/", { search: "?join=ABCDEF" })).toBe(true);
    expect(cleared("/", { stored: { "crossword-clash-mp": "{}" } })).toBe(true);
    expect(cleared("/", { stored: { "crossword-clash-solo": "{}" } })).toBe(true);
    expect(cleared("/menu", { stored: { "crossword-clash-solo": "{}" } })).toBe(false);
  });

  it("names the storage keys non-English detection reads", () => {
    const script = guardScript("/privacy");
    expect(script).toContain('localStorage.getItem("crossword-clash:language")');
    expect(script).toContain("navigator.language");
    expect(script).toContain('document.getElementById("root").replaceChildren()');
    expect(script).not.toContain("crossword-clash-solo");
  });

  it("also clears it on / for every state IndexRedirect sends elsewhere", () => {
    const script = guardScript("/");
    for (const needle of ['"#puzzle="', '"#import"', "join=", '"crossword-clash-mp"', '"crossword-clash-solo"']) {
      expect(script).toContain(needle);
    }
  });

  it("is valid JavaScript", () => {
    for (const route of ["/", "/archive"]) expect(() => new Function(guardScript(route))).not.toThrow();
  });
});

describe("normalizePathname", () => {
  it("drops trailing slashes and keeps the root", () => {
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname("/archive/")).toBe("/archive");
    expect(normalizePathname("/archive")).toBe("/archive");
  });
});

describe("escapeHtml / scriptJson", () => {
  it("escape the characters that matter", () => {
    expect(escapeHtml(`<a href="x">&</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
    expect(scriptJson({ s: "</script>\u2028" })).toBe('{"s":"\\u003c/script>\\u2028"}');
  });
});
