import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { formatDay, formatSeconds, spliceHead } from "./share";

const INDEX = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Crossword Clash — Real-Time Multiplayer Crossword Puzzles</title>
<meta name="description" content="Compete head-to-head." />
<meta property="og:title" content="Crossword Clash" />
<meta property="og:image" content="https://x.test/og.png" />
<meta name="twitter:card" content="summary" />
<link rel="icon" href="/favicon.svg" />
</head>
<body><div id="root" data-prerendered="/"><h1>Home</h1></div><script type="module" src="/assets/index-abc.js"></script></body>
</html>`;

function meta(html: string, key: string): string | null {
  const m = new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(html);
  return m ? m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"') : null;
}

describe("formatSeconds / formatDay", () => {
  it("formats whole seconds as m:ss and h:mm:ss", () => {
    expect(formatSeconds("102")).toBe("1:42");
    expect(formatSeconds("5")).toBe("0:05");
    expect(formatSeconds("3725")).toBe("1:02:05");
  });

  it("rejects anything that is not a plain number", () => {
    expect(formatSeconds("1:42")).toBe("");
    expect(formatSeconds("-3")).toBe("");
    expect(formatSeconds("")).toBe("");
  });

  it("formats a calendar day independent of the server's zone", () => {
    expect(formatDay("2026-10-20")).toBe("Oct 20");
    expect(formatDay("2026-01-01")).toBe("Jan 1");
  });
});

describe("spliceHead", () => {
  it("replaces the page's title and social tags and keeps the rest of the document", () => {
    const html = spliceHead(INDEX, {
      title: "Archer solved the Daily Mini",
      description: "Beat my time",
      image: "https://x.test/api/og?x=1",
      url: "https://x.test/daily/2026-10-20/mini",
    });
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).toContain("<title>Archer solved the Daily Mini</title>");
    expect(html.match(/property="og:title"/g)).toHaveLength(1);
    expect(meta(html, "og:image")).toBe("https://x.test/api/og?x=1");
    expect(meta(html, "description")).toBe("Beat my time");
    expect(html).toContain('data-prerendered="/"');
    expect(html).toContain("/assets/index-abc.js");
    expect(html).toContain('rel="icon"');
  });
});

describe("Daily Plus link", () => {
  const calls: string[] = [];

  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { ok: true, text: async () => INDEX };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("plays the solve in the preview and says who solved the Daily Plus, in the app shell", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=bonus&day=2026-11-18&beat=102&by=Archer&r=VJ0ncnWyJ9j"));
    expect(res.status).toBe(200);
    // The shell only: the puzzle is Plus only and never read here.
    expect(calls).toEqual(["https://x.test/index.html"]);
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("Archer solved the Daily Plus for Nov 18 in 1:42 — race my solve");
    expect(meta(html, "og:description")).toContain("Crossword Clash Plus");
    expect(meta(html, "og:video")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j");
    expect(meta(html, "og:video:secure_url")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j");
    expect(meta(html, "og:video:type")).toBe("video/mp4");
    expect(meta(html, "og:image")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j&poster=1");
    expect(meta(html, "og:image:width")).toBe("1280");
    expect(meta(html, "og:url")).toBe("https://x.test/bonus/2026-11-18?beat=102&by=Archer&r=VJ0ncnWyJ9j");
    expect(html).toContain("/assets/index-abc.js");
    expect(html).not.toContain("http-equiv");
  });

  it("falls back to a card without a replay, or with an r that isn't a share ID", async () => {
    const html = await (await handler(new Request("https://x.test/api/share?t=bonus&day=2026-11-18&beat=102&by=Archer&r=%22%3E%3Cscript%3Exyz"))).text();
    expect(meta(html, "og:title")).toBe("Archer solved the Daily Plus for Nov 18 in 1:42 — beat my time");
    expect(meta(html, "og:video")).toBeNull();
    expect(meta(html, "og:url")).toBe("https://x.test/bonus/2026-11-18?beat=102&by=Archer");
    const image = new URL(meta(html, "og:image")!);
    expect(image.pathname).toBe("/api/og");
    expect(image.searchParams.get("heading")).toBe("Daily Plus · Nov 18");
    expect(image.searchParams.get("metric")).toBe("1:42");
    expect(image.searchParams.get("title")).toBe("Archer");
    // No name and no time: the unsigned solver, and the plain card.
    const unsigned = await (await handler(new Request("https://x.test/api/share?t=bonus&day=2026-11-18&beat=60"))).text();
    expect(meta(unsigned, "og:title")).toBe("I solved the Daily Plus for Nov 18 in 1:00 — beat my time");
    const plain = await (await handler(new Request("https://x.test/api/share?t=bonus&day=2026-11-18"))).text();
    expect(meta(plain, "og:title")).toBe("The Daily Plus for Nov 18 on Crossword Clash");
    expect(meta(plain, "og:url")).toBe("https://x.test/bonus/2026-11-18");
  });

  it("calls a shared Daily Plus race a race and names its solvers", async () => {
    const html = await (await handler(new Request("https://x.test/api/share?t=bonus&day=2026-11-18&r=VJ0ncnWyJ9j&race=2&who=minna,archer"))).text();
    expect(meta(html, "og:title")).toBe("minna vs archer on the Daily Plus for Nov 18");
    expect(meta(html, "og:description")).toContain("who got to each square first");
    expect(meta(html, "og:video")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j");
    expect(meta(html, "og:url")).toBe("https://x.test/bonus/2026-11-18?r=VJ0ncnWyJ9j&race=2&who=minna%2Carcher");
  });

  it("refuses a malformed day", async () => {
    expect((await handler(new Request("https://x.test/api/share?t=bonus&day=leaderboard"))).status).toBe(404);
    expect((await handler(new Request("https://x.test/api/share?t=bonus"))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("is rewritten from /bonus/:day by vercel.json, which leaves the bonus board to the app", async () => {
    const { readFileSync } = await import("node:fs");
    const vercel = JSON.parse(readFileSync(decodeURIComponent(new URL("../vercel.json", import.meta.url).pathname), "utf8")) as { rewrites: { source: string; destination: string }[] };
    const rule = vercel.rewrites.find((r) => r.destination.startsWith("/api/share?t=bonus"));
    expect(rule).toEqual({ source: "/bonus/:day(\\d{4}-\\d{2}-\\d{2})", destination: "/api/share?t=bonus&day=:day" });
    const day = new RegExp(`^${/\((.+)\)$/.exec(rule!.source)![1]}$`);
    expect(day.test("2026-11-18")).toBe(true);
    expect(day.test("leaderboard")).toBe(false);
  });
});

describe("daily link", () => {
  const calls: string[] = [];
  let indexOk = true;

  beforeEach(() => {
    calls.length = 0;
    indexOk = true;
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { ok: indexOk, text: async () => INDEX };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves the app shell with a beat-my-time card for a daily link", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=mini&beat=102&by=Archer"));
    expect(res.status).toBe(200);
    expect(calls).toEqual(["https://x.test/index.html"]);
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("Archer solved the Daily Mini for Oct 20 in 1:42 — beat my time");
    expect(meta(html, "og:url")).toBe("https://x.test/daily/2026-10-20/mini?beat=102&by=Archer");
    const image = new URL(meta(html, "og:image")!);
    expect(image.pathname).toBe("/api/og");
    expect(image.searchParams.get("heading")).toBe("Daily Mini · Oct 20");
    expect(image.searchParams.get("metric")).toBe("1:42");
    expect(image.searchParams.get("title")).toBe("Archer");
    // The SPA itself, not a redirect page.
    expect(html).toContain("/assets/index-abc.js");
    expect(html).not.toContain("http-equiv");
  });

  it("plays the solve in the preview when the link carries a replay share ID (og:video, the clip's poster)", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=mini&beat=102&by=Archer&r=VJ0ncnWyJ9j"));
    const html = await res.text();
    expect(meta(html, "og:video")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j");
    expect(meta(html, "og:video:secure_url")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j");
    expect(meta(html, "og:video:type")).toBe("video/mp4");
    expect(meta(html, "og:image")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j&poster=1");
    expect(meta(html, "og:image:width")).toBe("1280");
    expect(meta(html, "og:url")).toBe("https://x.test/daily/2026-10-20/mini?beat=102&by=Archer&r=VJ0ncnWyJ9j");
  });

  it("calls a shared race a race, and keeps it one on the way into the app", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=mini&r=VJ0ncnWyJ9j&race=2"));
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("A head-to-head race on the Daily Mini for Oct 20");
    expect(meta(html, "og:description")).toContain("who got to each square first");
    expect(meta(html, "og:video")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j");
    expect(meta(html, "og:url")).toBe("https://x.test/daily/2026-10-20/mini?r=VJ0ncnWyJ9j&race=2");
  });

  it("names the two in a head-to-head, so the preview reads the same to both", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=mini&r=VJ0ncnWyJ9j&race=2&who=minna,archer"));
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("minna vs archer on the Daily Mini for Oct 20");
    expect(meta(html, "og:url")).toBe("https://x.test/daily/2026-10-20/mini?r=VJ0ncnWyJ9j&race=2&who=minna%2Carcher");
    // A name short of the count names nobody.
    const short = await (await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=mini&r=VJ0ncnWyJ9j&race=3&who=minna,archer"))).text();
    expect(meta(short, "og:title")).toBe("A 3-way race on the Daily Mini for Oct 20");
  });

  it("reads a clip with no time to beat as a race, for links sent before the count was added", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=mini&r=VJ0ncnWyJ9j&race=99"));
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("A race on the Daily Mini for Oct 20");
    expect(meta(html, "og:url")).toBe("https://x.test/daily/2026-10-20/mini?r=VJ0ncnWyJ9j");
  });

  it("ignores an r that isn't a share ID", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=mini&beat=102&r=%22%3E%3Cscript%3Exyz"));
    const html = await res.text();
    expect(meta(html, "og:video")).toBeNull();
    expect(new URL(meta(html, "og:image")!).pathname).toBe("/api/og");
  });

  it("describes a plain daily link (no time) as an invitation to play", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=large"));
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("Play the Daily Large for Oct 20 on Crossword Clash");
    expect(meta(html, "og:url")).toBe("https://x.test/daily/2026-10-20/large");
  });

  it("falls back to the card-plus-redirect page when the shell cannot be fetched", async () => {
    indexOk = false;
    const res = await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=midi&beat=60"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(meta(html, "og:title")).toBe("I solved the Daily Midi for Oct 20 in 1:00 — beat my time");
    expect(html).toContain('http-equiv="refresh" content="0;url=https://x.test/"');
  });

  it("refuses a malformed day or slot", async () => {
    expect((await handler(new Request("https://x.test/api/share?t=daily&day=today&slot=mini"))).status).toBe(404);
    expect((await handler(new Request("https://x.test/api/share?t=daily&day=2026-10-20&slot=huge"))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("keeps the result and race cards as redirect pages", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=result&title=Deep%20Blue&time=1:42"));
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("I solved “Deep Blue” in 1:42");
    expect(html).toContain('http-equiv="refresh" content="0;url=https://x.test/"');
    expect(calls).toHaveLength(0);
  });
});

describe("add-me link", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", async () => ({ ok: true, text: async () => INDEX }));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says who is asking, and serves the app", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=add&u=archer_1"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("@archer_1 wants to be friends on Crossword Clash");
    expect(meta(html, "og:url")).toBe("https://x.test/add/archer_1");
    expect(new URL(meta(html, "og:image")!).searchParams.get("title")).toBe("@archer_1");
    expect(html).toContain("/assets/index-abc.js");
  });

  it("refuses a name that could not be a username", async () => {
    expect((await handler(new Request("https://x.test/api/share?t=add&u=a%20b"))).status).toBe(404);
  });
});

describe("community puzzle link", () => {
  const calls: string[] = [];
  let rows: unknown[] = [{ title: "Farm", author: "ada", width: 5, height: 5, difficulty: "easy" }];

  beforeEach(() => {
    calls.length = 0;
    rows = [{ title: "Farm", author: "ada", width: 5, height: 5, difficulty: "easy" }];
    vi.stubEnv("VITE_SUPABASE_URL", "https://db.test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return url.startsWith("https://db.test") ? { ok: true, json: async () => rows } : { ok: true, text: async () => INDEX };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("unfurls a community puzzle by title, author and size, and serves the app", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=puzzle&id=ab12cd34"));
    const html = await res.text();
    expect(calls[0]).toBe("https://db.test/rest/v1/community_puzzles?short_id=eq.ab12cd34&status=eq.published&select=title,author,width,height,difficulty");
    expect(meta(html, "og:title")).toBe("“Farm” by @ada — Crossword Clash");
    expect(meta(html, "og:description")).toBe("A 5×5 community crossword by @ada · Easy. Play it free on Crossword Clash, solo or racing friends.");
    expect(meta(html, "og:url")).toBe("https://x.test/puzzles/ab12cd34");
    const image = new URL(meta(html, "og:image")!);
    expect(image.pathname).toBe("/api/og");
    expect(image.searchParams.get("title")).toBe("Farm");
    expect(html).toContain("/assets/index-abc.js");
  });

  it("plays the sender's solve for a race link, and names their time", async () => {
    const res = await handler(new Request("https://x.test/api/share?t=puzzle&id=ab12cd34&beat=75&by=Archer&r=VJ0ncnWyJ9j"));
    const html = await res.text();
    expect(meta(html, "og:title")).toBe("Archer solved “Farm” in 1:15 — race my solve");
    expect(meta(html, "og:video")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j");
    expect(meta(html, "og:image")).toBe("https://x.test/api/replay?s=VJ0ncnWyJ9j&poster=1");
    expect(meta(html, "og:url")).toBe("https://x.test/puzzles/ab12cd34?beat=75&by=Archer&r=VJ0ncnWyJ9j");
  });

  it("still serves the app with a plain card when the puzzle isn't published or can't be read", async () => {
    rows = [];
    const res = await handler(new Request("https://x.test/api/share?t=puzzle&id=ab12cd34&beat=75"));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(meta(html, "og:title")).toBe("I solved a community crossword in 1:15 — beat my time");
    expect(html).toContain("/assets/index-abc.js");
  });

  it("refuses an id that isn't a short ID", async () => {
    expect((await handler(new Request("https://x.test/api/share?t=puzzle&id=..%2Fx"))).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
