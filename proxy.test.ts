import { describe, expect, it } from "vitest";
import proxy, { feedDay, isReleased, lastReleasedDay } from "./proxy";

// 2026-10-23 22:30 UTC: the 24th has begun in UTC+2 and later zones.
const NOW = new Date("2026-10-23T22:30:00Z");

describe("feedDay", () => {
  it("reads the day from the mini, midi and large paths", () => {
    expect(feedDay("/daily-puzzles/2026-10-23.json")).toBe("2026-10-23");
    expect(feedDay("/daily-puzzles/midi/2026-10-23.json")).toBe("2026-10-23");
    expect(feedDay("/daily-puzzles/large/2026-10-23.json")).toBe("2026-10-23");
  });

  it("ignores anything under the folder that is not a day file", () => {
    expect(feedDay("/daily-puzzles/index.json")).toBeNull();
    expect(feedDay("/daily-puzzles/2026-10.json")).toBeNull();
    expect(feedDay("/daily-puzzles/midi/")).toBeNull();
    expect(feedDay("/daily-puzzles/huge/2026-10-23.json")).toBeNull();
    expect(feedDay("/other/2026-10-23.json")).toBeNull();
  });
});

describe("lastReleasedDay / isReleased", () => {
  it("opens a day at 00:00 UTC on its eve, like the schedule table's policy", () => {
    expect(lastReleasedDay(NOW)).toBe("2026-10-24");
    expect(isReleased("2026-10-24", NOW)).toBe(true);
    expect(isReleased("2026-10-25", NOW)).toBe(false);
    expect(isReleased("2026-10-25", new Date("2026-10-23T23:59:59Z"))).toBe(false);
    expect(isReleased("2026-10-25", new Date("2026-10-24T00:00:00Z"))).toBe(true);
  });

  it("keeps every past day open", () => {
    expect(isReleased("2026-10-23", NOW)).toBe(true);
    expect(isReleased("2025-01-01", NOW)).toBe(true);
  });

  it("crosses month and year boundaries", () => {
    expect(lastReleasedDay(new Date("2026-12-31T12:00:00Z"))).toBe("2027-01-01");
    expect(lastReleasedDay(new Date("2026-02-28T12:00:00Z"))).toBe("2026-03-01");
  });
});

describe("proxy", () => {
  const request = (path: string) => new Request(`https://crosswordclash.com${path}`);

  it("lets released days and non-day files through to the static file", () => {
    for (const path of [
      "/daily-puzzles/2026-10-23.json",
      "/daily-puzzles/large/2026-10-24.json",
      "/daily-puzzles/2020-01-01.json",
      "/daily-puzzles/index.json",
    ]) {
      const res = proxy(request(path), undefined, NOW);
      expect(res.headers.get("x-middleware-next"), path).toBe("1");
    }
  });

  it("answers 404 for a day that has not started, in every slot", async () => {
    for (const path of [
      "/daily-puzzles/2026-10-25.json",
      "/daily-puzzles/midi/2026-10-25.json",
      "/daily-puzzles/large/2026-11-05.json",
    ]) {
      const res = proxy(request(path), undefined, NOW);
      expect(res.status, path).toBe(404);
      expect(res.headers.get("x-middleware-next")).toBeNull();
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: "not_found" });
    }
  });

  it("scopes itself to the feed folder", () => {
    expect(proxy(request("/menu"), undefined, NOW).headers.get("x-middleware-next")).toBe("1");
  });
});
