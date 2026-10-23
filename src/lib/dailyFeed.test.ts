import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  ABSENT_TTL_MS,
  currentDailyMini,
  currentDailyPuzzle,
  dailyFeedPath,
  dailyFeedUrl,
  isDailySlot,
  knownDailyMini,
  knownDailyPuzzle,
  parseDailyFeedEntry,
  resetDailyFeedMemory,
  resolveDailyMini,
  resolveDailyPuzzle,
  type DailyFeedEntry, DAILY_SLOTS,
  displayTheme,
} from "./dailyFeed";
import { getDailyMini, type DailyMini } from "./dailyMinis";
import { isTodaysDaily, leaderboardPath, todaysDailySlot } from "./dailyLeaderboard";
import { puzzleToTransferFormat } from "./puzzleNormalizer";

const NOW = new Date(2026, 9, 14, 9, 0, 0);
const bundled = getDailyMini(NOW);
// Any bundled puzzle that is NOT today's stands in for a syndicated one.
const other = getDailyMini(new Date(2026, 9, 15));
const feedEntry: DailyFeedEntry = { theme: "Syndicated", puzzle: puzzleToTransferFormat(other.puzzle) };

function respond(status: number, body: unknown) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    calls.push(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (body === "html") throw new SyntaxError("Unexpected token <");
        return body;
      },
    };
  };
  return { fetchImpl, calls };
}

function installStorage() {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

beforeEach(() => {
  installStorage();
  resetDailyFeedMemory();
});

describe("parseDailyFeedEntry", () => {
  it("accepts a feed file, with or without a theme", () => {
    expect(parseDailyFeedEntry(feedEntry)?.puzzle.title).toBe(other.puzzle.title);
    expect(parseDailyFeedEntry({ puzzle: feedEntry.puzzle })?.theme).toBe("");
  });

  it("rejects anything that is not a playable puzzle", () => {
    expect(parseDailyFeedEntry(null)).toBeNull();
    expect(parseDailyFeedEntry("<!doctype html>")).toBeNull();
    expect(parseDailyFeedEntry({})).toBeNull();
    expect(parseDailyFeedEntry({ theme: 3, puzzle: feedEntry.puzzle })).toBeNull();
    expect(parseDailyFeedEntry({ puzzle: { ...feedEntry.puzzle, grid: ["A"] } })).toBeNull();
  });
});

describe("dailyFeedUrl", () => {
  it("is same-origin on the web and the public site in the apps", () => {
    expect(dailyFeedUrl("2026-10-14")).toBe("/daily-puzzles/2026-10-14.json");
    expect(dailyFeedUrl("2026-10-14", "mini", "https://crosswordclash.com")).toBe(
      "https://crosswordclash.com/daily-puzzles/2026-10-14.json",
    );
  });

  it("keeps the large in its own folder, where vercel.json rewrites it", () => {
    expect(dailyFeedPath("large", "2026-10-14")).toBe("/daily-puzzles/large/2026-10-14.json");
    expect(dailyFeedUrl("2026-10-14", "large", "https://crosswordclash.com")).toBe(
      "https://crosswordclash.com/daily-puzzles/large/2026-10-14.json",
    );
    const vercelPath = decodeURIComponent(new URL("../../vercel.json", import.meta.url).pathname);
    const vercel = JSON.parse(new TextDecoder().decode(readFileSync(vercelPath))) as {
      rewrites: { source: string; destination: string }[];
    };
    expect(vercel.rewrites).toContainEqual({ source: "/daily-puzzles/large/:day.json", destination: "/api/daily?day=:day&slot=large" });
    expect(vercel.rewrites).toContainEqual({ source: "/daily-puzzles/midi/:day.json", destination: "/api/daily?day=:day&slot=midi" });
    expect(dailyFeedPath("midi", "2026-10-14")).toBe("/daily-puzzles/midi/2026-10-14.json");
    expect(vercel.rewrites).toContainEqual({ source: "/daily-puzzles/:day.json", destination: "/api/daily?day=:day" });
  });

  it("knows its slots", () => {
    expect(isDailySlot("mini")).toBe(true);
    expect(isDailySlot("large")).toBe(true);
    expect(isDailySlot("midi")).toBe(true);
    expect(isDailySlot("huge")).toBe(false);
    expect(leaderboardPath("mini")).toBe("/daily/leaderboard");
    expect(leaderboardPath("large")).toBe("/daily/leaderboard/large");
    expect(leaderboardPath("midi")).toBe("/daily/leaderboard/midi");
  });
});

describe("resolveDailyMini", () => {
  it("serves the feed's puzzle for the day and remembers it", async () => {
    const { fetchImpl, calls } = respond(200, feedEntry);
    expect(knownDailyMini(NOW)).toBeNull();

    const mini = await resolveDailyMini(NOW, fetchImpl);
    expect(mini.puzzle.title).toBe(other.puzzle.title);
    expect(mini.theme).toBe("Syndicated");
    expect(calls).toEqual([dailyFeedUrl("2026-10-14")]);

    // Second ask, and a fresh page load, answer from the cache.
    await resolveDailyMini(NOW, fetchImpl);
    resetDailyFeedMemory();
    expect(knownDailyMini(NOW)?.puzzle.title).toBe(other.puzzle.title);
    expect(calls).toHaveLength(1);
  });

  it("makes the leaderboard check follow the feed", async () => {
    await resolveDailyMini(NOW, respond(200, feedEntry).fetchImpl);
    expect(isTodaysDaily(other.puzzle, NOW)).toBe(true);
    expect(isTodaysDaily(bundled.puzzle, NOW)).toBe(false);
  });

  it("falls back to the bundled rotation when the day has no file", async () => {
    for (const [status, body] of [[404, null], [200, "html"], [200, { nope: true }]] as const) {
      installStorage();
      resetDailyFeedMemory();
      const { fetchImpl, calls } = respond(status, body);
      expect(await resolveDailyMini(NOW, fetchImpl)).toBe(bundled);
      expect(knownDailyMini(NOW)).toBe(bundled);
      await resolveDailyMini(NOW, fetchImpl);
      expect(calls).toHaveLength(1);
    }
  });

  it("asks again once a 'nothing published' answer goes stale", async () => {
    const { fetchImpl, calls } = respond(404, null);
    await resolveDailyMini(NOW, fetchImpl);
    const later = new Date(NOW.getTime() + ABSENT_TTL_MS);
    expect(knownDailyMini(later)).toBeNull();
    expect(currentDailyMini(later)).toBe(bundled);
    await resolveDailyMini(later, fetchImpl);
    expect(calls).toHaveLength(2);
  });

  it("falls back without persisting when the feed cannot be reached", async () => {
    const failing = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await resolveDailyMini(NOW, failing)).toBe(bundled);
    expect(await resolveDailyMini(NOW, respond(500, null).fetchImpl)).toBe(bundled);
    resetDailyFeedMemory();
    expect(knownDailyMini(NOW)).toBeNull();
  });

  it("does not carry one day's puzzle into the next", async () => {
    await resolveDailyMini(NOW, respond(200, feedEntry).fetchImpl);
    const tomorrow = new Date(2026, 9, 15, 0, 5);
    expect(knownDailyMini(tomorrow)).toBeNull();
    expect(currentDailyMini(tomorrow)).toBe(getDailyMini(tomorrow));
  });

  it("shares one request between simultaneous callers", async () => {
    const { fetchImpl, calls } = respond(200, feedEntry);
    await Promise.all([resolveDailyMini(NOW, fetchImpl), resolveDailyMini(NOW, fetchImpl)]);
    expect(calls).toHaveLength(1);
  });
});

describe("resolveDailyPuzzle('large')", () => {
  it("has no large until the feed says so, then remembers it apart from the mini", async () => {
    expect(knownDailyPuzzle("large", NOW)).toBeUndefined();
    expect(currentDailyPuzzle("large", NOW)).toBeNull();

    const { fetchImpl, calls } = respond(200, feedEntry);
    const large = await resolveDailyPuzzle("large", NOW, fetchImpl);
    expect(large?.puzzle.title).toBe(other.puzzle.title);
    expect(calls).toEqual([dailyFeedUrl("2026-10-14", "large")]);

    // The mini's cache is untouched, and the large survives a fresh page load.
    expect(knownDailyMini(NOW)).toBeNull();
    resetDailyFeedMemory();
    expect(knownDailyPuzzle("large", NOW)?.puzzle.title).toBe(other.puzzle.title);
  });

  it("shows no large — not the bundled mini — when nothing is published", async () => {
    const { fetchImpl, calls } = respond(404, null);
    expect(await resolveDailyPuzzle("large", NOW, fetchImpl)).toBeNull();
    // Known to be absent: answered without asking again.
    expect(knownDailyPuzzle("large", NOW)).toBeNull();
    await resolveDailyPuzzle("large", NOW, fetchImpl);
    expect(calls).toHaveLength(1);
    // The mini still falls back to its rotation.
    expect(currentDailyMini(NOW)).toBe(bundled);
  });

  it("tells the two dailies apart for the leaderboards", async () => {
    await resolveDailyPuzzle("large", NOW, respond(200, feedEntry).fetchImpl);
    await resolveDailyMini(NOW, respond(404, null).fetchImpl);
    expect(todaysDailySlot(other.puzzle, NOW)).toBe("large");
    expect(todaysDailySlot(bundled.puzzle, NOW)).toBe("mini");
    expect(isTodaysDaily(other.puzzle, NOW)).toBe(true);
    expect(todaysDailySlot(getDailyMini(new Date(2026, 9, 16)).puzzle, NOW)).toBeNull();
  });
});

describe("published feed files", () => {
  const dir = decodeURIComponent(new URL("../../public/daily-puzzles/", import.meta.url).pathname);
  // The directory does not exist until the first puzzle is published.
  const files = (() => {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  })();

  // Every slot but the mini lives in its own folder (see dailyFeedPath).
  const slotFiles = DAILY_SLOTS.filter((s) => s !== "mini").flatMap((slot) => {
    try {
      return readdirSync(dir + slot + "/").map((f) => slot + "/" + f);
    } catch {
      return [];
    }
  });

  it("are all named for a date and parse as playable puzzles", () => {
    // The slot folders, plus the archive index (index.json + index/, checked by dailyIndex.test.ts).
    const skip = new Set<string>([...DAILY_SLOTS, "index", "index.json"]);
    for (const file of [...files.filter((f) => !skip.has(f)), ...slotFiles]) {
      expect(file).toMatch(/^(?:[a-z]+\/)?\d{4}-\d{2}-\d{2}\.json$/);
      const data: unknown = JSON.parse(new TextDecoder().decode(readFileSync(dir + file)));
      expect(parseDailyFeedEntry(data), file).not.toBeNull();
    }
  });
});

describe("displayTheme", () => {
  const daily = (theme: string | undefined, title: string) => ({ theme: theme ?? "", puzzle: { title } as DailyMini["puzzle"] });
  it("shows a theme that adds something and hides one that repeats the title", () => {
    expect(displayTheme(daily("Coffee", "Coffee Break"))).toBe("Coffee");
    expect(displayTheme(daily("Coffee Break", "Coffee Break"))).toBe("");
    expect(displayTheme(daily(" coffee break ", "Coffee Break"))).toBe("");
    expect(displayTheme(daily(undefined, "Coffee Break"))).toBe("");
    expect(displayTheme(null)).toBe("");
  });
});
