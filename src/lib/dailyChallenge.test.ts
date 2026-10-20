import { describe, it, expect } from "vitest";
import { buildDailyLink, dailyPath, isDailyDay, parseDailyChallenge, parseDailyRoute } from "./dailyChallenge";

describe("buildDailyLink", () => {
  it("builds the short date link with the ghost time and name", () => {
    expect(buildDailyLink("https://crosswordclash.com", { day: "2026-10-20", slot: "mini", seconds: 102, name: "Archer" })).toBe(
      "https://crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer",
    );
  });

  it("drops the query when there is no time and no name, and trims a trailing slash", () => {
    expect(buildDailyLink("https://crosswordclash.com/", { day: "2026-10-20", slot: "large" })).toBe(
      "https://crosswordclash.com/daily/2026-10-20/large",
    );
  });

  it("floors fractional seconds, clamps negatives and collapses the name's whitespace", () => {
    expect(buildDailyLink("https://x.test", { day: "2026-10-20", slot: "midi", seconds: 61.9, name: "  A   B " })).toBe(
      "https://x.test/daily/2026-10-20/midi?beat=61&by=A+B",
    );
    expect(buildDailyLink("https://x.test", { day: "2026-10-20", slot: "midi", seconds: -4 })).toContain("beat=0");
  });

  it("omits a blank name", () => {
    expect(buildDailyLink("https://x.test", { day: "2026-10-20", slot: "mini", seconds: 9, name: "   " })).toBe(
      "https://x.test/daily/2026-10-20/mini?beat=9",
    );
  });
});

describe("parseDailyRoute", () => {
  it("accepts a calendar day and a known slot", () => {
    expect(parseDailyRoute("2026-10-20", "mini")).toEqual({ day: "2026-10-20", slot: "mini" });
    expect(parseDailyRoute("2026-10-20", "large")).toEqual({ day: "2026-10-20", slot: "large" });
  });

  it("refuses anything else", () => {
    expect(parseDailyRoute("leaderboard", "mini")).toBeNull();
    expect(parseDailyRoute("2026-10-20", "huge")).toBeNull();
    expect(parseDailyRoute(undefined, undefined)).toBeNull();
    expect(isDailyDay("2026-1-2")).toBe(false);
    expect(dailyPath("2026-10-20", "midi")).toBe("/daily/2026-10-20/midi");
  });
});

describe("parseDailyChallenge", () => {
  it("reads the ghost time and name", () => {
    expect(parseDailyChallenge("?beat=102&by=Archer", "A friend")).toEqual({ name: "Archer", seconds: 102 });
    expect(parseDailyChallenge("beat=0&by=Sam", "A friend")).toEqual({ name: "Sam", seconds: 0 });
  });

  it("falls back to the given name when `by` is missing or blank", () => {
    expect(parseDailyChallenge("?beat=30", "A friend")).toEqual({ name: "A friend", seconds: 30 });
    expect(parseDailyChallenge("?beat=30&by=%20", "A friend")).toEqual({ name: "A friend", seconds: 30 });
  });

  it("is null without a usable time, so a plain daily link is not a challenge", () => {
    expect(parseDailyChallenge("", "A friend")).toBeNull();
    expect(parseDailyChallenge("?by=Archer", "A friend")).toBeNull();
    expect(parseDailyChallenge("?beat=fast", "A friend")).toBeNull();
    expect(parseDailyChallenge("?beat=-3", "A friend")).toBeNull();
    expect(parseDailyChallenge("?beat=1.5", "A friend")).toBeNull();
  });
});
