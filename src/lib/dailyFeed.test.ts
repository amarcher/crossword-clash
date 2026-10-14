import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  ABSENT_TTL_MS,
  currentDailyMini,
  dailyFeedUrl,
  knownDailyMini,
  parseDailyFeedEntry,
  resetDailyFeedMemory,
  resolveDailyMini,
  type DailyFeedEntry,
} from "./dailyFeed";
import { getDailyMini } from "./dailyMinis";
import { isTodaysDaily } from "./dailyLeaderboard";
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

  it("are all named for a date and parse as playable puzzles", () => {
    for (const file of files) {
      expect(file).toMatch(/^\d{4}-\d{2}-\d{2}\.json$/);
      const data: unknown = JSON.parse(new TextDecoder().decode(readFileSync(dir + file)));
      expect(parseDailyFeedEntry(data), file).not.toBeNull();
    }
  });
});
