import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler, { solveTitle as serverSolveTitle } from "../../api/share";
import { buildPuzzleLink } from "./dailyChallenge";
import { linkPreviewTitle, solveTitle } from "./linkPreview";

const SHELL = `<!doctype html><html><head><title>Crossword Clash</title></head><body><div id="root"></div></body></html>`;

/** The og:title the server gives a link's path, as a crawler would read it (vercel.json rewrites the path to /api/share). */
async function served(query: string): Promise<string> {
  const res = await handler(new Request(`https://crosswordclash.com/api/share?${query}`));
  const html = await res.text();
  return (/<meta property="og:title" content="([^"]*)"/.exec(html)?.[1] ?? "").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
}

describe("linkPreviewTitle", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(SHELL, { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is the server's sentence, word for word", () => {
    expect(solveTitle("Archer", "the Nov 18 Daily Mini", "1:02")).toBe(serverSolveTitle("Archer", "the Nov 18 Daily Mini", "1:02"));
    expect(solveTitle("", "“Farm”", "1:15")).toBe(serverSolveTitle("", "“Farm”", "1:15"));
  });

  it("says what a daily's and a Daily Plus's link will unfurl with", async () => {
    const daily = buildPuzzleLink("https://crosswordclash.com", { day: "2026-11-18", slot: "mini" }, { seconds: 62, name: "Archer", replay: "E0Gqr8Iw09i" });
    expect(linkPreviewTitle(daily)).toBe("Archer solved the Nov 18 Daily Mini in 1:02");
    expect(linkPreviewTitle(daily)).toBe(await served("t=daily&day=2026-11-18&slot=mini&beat=62&by=Archer&r=E0Gqr8Iw09i"));
    const bonus = buildPuzzleLink("https://crosswordclash.com", { bonusDay: "2026-11-18" }, { seconds: 3725, name: "Archer" });
    expect(linkPreviewTitle(bonus)).toBe("Archer solved the Nov 18 Daily Plus in 1:02:05");
    expect(linkPreviewTitle(bonus)).toBe(await served("t=bonus&day=2026-11-18&beat=3725&by=Archer"));
  });

  it("names a community puzzle by its title, and nothing for a link that is not a timed solve", () => {
    const link = buildPuzzleLink("https://crosswordclash.com", { shortId: "ab12cd34" }, { seconds: 75, name: "Sam" });
    expect(linkPreviewTitle(link, "Farm")).toBe("Sam solved “Farm” in 1:15");
    expect(linkPreviewTitle(link)).toBe("Sam solved a community crossword in 1:15");
    expect(linkPreviewTitle("https://crosswordclash.com/daily/2026-11-18/mini")).toBeNull();
    expect(linkPreviewTitle("https://crosswordclash.com/#puzzle=abc")).toBeNull();
  });
});
