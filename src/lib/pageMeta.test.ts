// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import i18n from "../i18n/i18n";
import { PRERENDERED_ROUTES, SITE_ORIGIN, applyPageMeta, metaTags, pageMetaFor } from "./pageMeta";

const t = (key: string) => i18n.t(key);

describe("pageMetaFor", () => {
  it("gives every prerendered route a title, a description and an absolute canonical", () => {
    for (const route of PRERENDERED_ROUTES) {
      const meta = pageMetaFor(route, t);
      expect(meta.title.length, route).toBeGreaterThan(10);
      expect(meta.title.length, `${route} title fits a result`).toBeLessThanOrEqual(65);
      expect(meta.description.length, route).toBeGreaterThanOrEqual(80);
      // Google shows ~160; the home copy predates this table and runs a little long.
      expect(meta.description.length, `${route} description fits a snippet`).toBeLessThanOrEqual(175);
      expect(meta.canonical.startsWith(`${SITE_ORIGIN}/`), route).toBe(true);
    }
  });

  it("canonicalises /menu to the home page and gives other routes their own URL", () => {
    expect(pageMetaFor("/menu", t).canonical).toBe(`${SITE_ORIGIN}/`);
    expect(pageMetaFor("/", t).canonical).toBe(`${SITE_ORIGIN}/`);
    expect(pageMetaFor("/classics", t).canonical).toBe(`${SITE_ORIGIN}/classics`);
    expect(pageMetaFor("/classics/", t).canonical).toBe(`${SITE_ORIGIN}/classics`);
    expect(pageMetaFor("/account", t)).toEqual({ title: "Your account — Crossword Clash", description: expect.stringContaining("streaks"), canonical: `${SITE_ORIGIN}/account` });
  });

  it("uses the legal pages' own titles in the existing '| Crossword Clash' format", () => {
    expect(pageMetaFor("/privacy", t).title).toBe("Privacy Policy | Crossword Clash");
    expect(pageMetaFor("/terms", t).title).toBe("Terms of Use | Crossword Clash");
    expect(pageMetaFor("/support", t).title).toBe("Support | Crossword Clash");
  });

  it("falls back to the home meta for routes that are not listed", () => {
    expect(pageMetaFor("/solo/play", t)).toEqual(pageMetaFor("/", t));
    expect(pageMetaFor("/daily/leaderboard", t).canonical).toBe(`${SITE_ORIGIN}/`);
  });

  it("matches the static index.html defaults for the home page", () => {
    // index.html is the template every prerendered page starts from; its
    // title/description must be what the client would set on "/" anyway, or
    // a fresh visitor sees the tags change under them.
    const home = pageMetaFor("/", t);
    expect(home.title).toBe("Free Daily Mini, Midi & Large Crosswords — Crossword Clash");
    expect(home.description).toMatch(/^Three free crosswords a day/);
  });
});

describe("applyPageMeta", () => {
  it("writes title, description, canonical and the OG/Twitter copies into a document", () => {
    document.head.innerHTML = `
      <title>Old</title>
      <meta name="description" content="old" />
      <meta property="og:title" content="old" />
      <meta property="og:description" content="old" />
      <meta property="og:url" content="old" />
      <meta name="twitter:title" content="old" />
      <meta name="twitter:description" content="old" />
      <link rel="canonical" href="old" />`;
    const meta = pageMetaFor("/classics", t);
    applyPageMeta(meta, document);
    expect(document.title).toBe(meta.title);
    for (const [attr, name, content] of metaTags(meta)) {
      expect(document.head.querySelector(`meta[${attr}="${name}"]`)?.getAttribute("content"), name).toBe(content);
    }
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(meta.canonical);
  });

  it("tolerates a document without the tags", () => {
    document.head.innerHTML = "";
    expect(() => applyPageMeta(pageMetaFor("/privacy", t), document)).not.toThrow();
    expect(document.title).toBe("Privacy Policy | Crossword Clash");
  });
});
