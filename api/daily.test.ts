import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, selectDaily } from "./daily";

describe("selectDaily", () => {
  it("defaults to the mini slot", () => {
    expect(selectDaily("https://x.test/api/daily?day=2026-10-16")).toEqual({ day: "2026-10-16", slot: "mini" });
  });

  it("serves the large slot from its own path's rewrite", () => {
    expect(selectDaily("https://x.test/api/daily?day=2026-10-16&slot=large")).toEqual({ day: "2026-10-16", slot: "large" });
    expect(selectDaily("https://x.test/api/daily?day=2026-10-16&slot=midi")).toEqual({ day: "2026-10-16", slot: "midi" });
  });

  it("refuses malformed days and unknown slots", () => {
    expect(selectDaily("https://x.test/api/daily?day=today")).toBeNull();
    expect(selectDaily("https://x.test/api/daily?day=2026-10-16&slot=huge")).toBeNull();
    expect(selectDaily("https://x.test/api/daily")).toBeNull();
  });
});

describe("GET", () => {
  const calls: string[] = [];
  let rows: unknown[] = [];

  beforeEach(() => {
    calls.length = 0;
    rows = [];
    vi.stubEnv("VITE_SUPABASE_URL", "https://db.test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { ok: true, json: async () => rows };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("queries the schedule for the requested slot", async () => {
    rows = [{ entry: { puzzle: {} } }];
    const res = await GET(new Request("https://x.test/api/daily?day=2026-10-16&slot=large"));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("day=eq.2026-10-16");
    expect(calls[0]).toContain("slot=eq.large");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("filters the mini path to the mini slot so a large never leaks into it", async () => {
    await GET(new Request("https://x.test/api/daily?day=2026-10-16"));
    expect(calls[0]).toContain("slot=eq.mini");
  });

  it("answers 404 for a day with nothing scheduled, without touching the database for bad URLs", async () => {
    expect((await GET(new Request("https://x.test/api/daily?day=2026-10-16&slot=large"))).status).toBe(404);
    expect(calls).toHaveLength(1);
    expect((await GET(new Request("https://x.test/api/daily?day=2026-10-16&slot=huge"))).status).toBe(404);
    expect(calls).toHaveLength(1);
  });
});
