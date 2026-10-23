import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  blocksOf,
  fetchPublishedIndex,
  indexEntryFor,
  indexMonthPath,
  indexSummaryPath,
  isDailyIndexEntry,
  knownPublishedIndex,
  loadPublishedIndex,
  monthOf,
  parseIndexMonth,
  parseIndexSummary,
  publishedEntries,
  resetDailyIndexMemory,
  sortEntries,
  type DailyIndexEntry,
} from "./dailyIndex";
import { DAILY_SLOTS, dailyFeedPath, parseDailyFeedEntry } from "./dailyFeed";
import { puzzleIdentity } from "./soloStats";

const entry = (over: Partial<DailyIndexEntry> = {}): DailyIndexEntry => ({
  day: "2026-10-20",
  slot: "mini",
  title: "Taco Tuesday",
  theme: "Tacos",
  author: "Crossword Clash",
  width: 5,
  height: 5,
  clues: 10,
  identity: "abc",
  blocks: "....#/...../...../...../#....",
  ...over,
});

const FEED = {
  theme: "Ocean",
  puzzle: {
    title: "Deep Blue",
    author: "Crossword Clash",
    size: { rows: 3, cols: 3 },
    grid: ["C", "A", "T", "A", ".", "O", "B", "E", "T"],
    gridnums: [1, 0, 2, 0, 0, 0, 3, 0, 0],
    clues: { across: ["1. Feline", "3. Wager"], down: ["1. Taxi", "2. Digit"] },
    answers: { across: ["CAT", "BET"], down: ["CAB", "TOT"] },
  },
};

describe("indexEntryFor / blocksOf", () => {
  it("captures the puzzle's facts, its identity and its grid shape", () => {
    const daily = parseDailyFeedEntry(FEED)!;
    const e = indexEntryFor("2026-10-20", "midi", daily);
    expect(e).toMatchObject({ day: "2026-10-20", slot: "midi", title: "Deep Blue", theme: "Ocean", author: "Crossword Clash", width: 3, height: 3, clues: 4 });
    expect(e.identity).toBe(puzzleIdentity(daily.puzzle));
    expect(e.blocks).toBe(".../.#./...");
    expect(blocksOf(daily.puzzle)).toBe(e.blocks);
  });

  it("drops a theme that only repeats the title", () => {
    const daily = parseDailyFeedEntry({ ...FEED, theme: "deep blue" })!;
    expect(indexEntryFor("2026-10-20", "mini", daily).theme).toBe("");
  });
});

describe("sortEntries / monthOf", () => {
  it("orders by day, then mini → midi → large", () => {
    const out = sortEntries([
      entry({ day: "2026-10-21", slot: "large" }),
      entry({ day: "2026-10-20", slot: "large" }),
      entry({ day: "2026-10-21", slot: "mini" }),
      entry({ day: "2026-10-20", slot: "midi" }),
      entry({ day: "2026-10-20", slot: "mini" }),
    ]);
    expect(out.map((e) => `${e.day}/${e.slot}`)).toEqual([
      "2026-10-20/mini",
      "2026-10-20/midi",
      "2026-10-20/large",
      "2026-10-21/mini",
      "2026-10-21/large",
    ]);
  });

  it("monthOf takes the first seven characters", () => {
    expect(monthOf("2026-10-20")).toBe("2026-10");
  });
});

describe("parsing", () => {
  it("accepts a complete entry and rejects malformed ones", () => {
    expect(isDailyIndexEntry(entry())).toBe(true);
    expect(isDailyIndexEntry(entry({ slot: "huge" as never }))).toBe(false);
    expect(isDailyIndexEntry(entry({ day: "20/10/2026" }))).toBe(false);
    expect(isDailyIndexEntry({ ...entry(), identity: 7 })).toBe(false);
    expect(isDailyIndexEntry(null)).toBe(false);
  });

  it("parseIndexMonth drops junk and sorts; non-arrays are empty", () => {
    expect(parseIndexMonth([entry({ day: "2026-10-21" }), "junk", entry({ day: "2026-10-20" }), { day: 1 }]).map((e) => e.day)).toEqual([
      "2026-10-20",
      "2026-10-21",
    ]);
    expect(parseIndexMonth({})).toEqual([]);
  });

  it("parseIndexSummary validates the shape and filters months", () => {
    expect(parseIndexSummary({ first: "2026-10-16", last: "2026-12-12", months: ["2026-10", 7, "2026-11"] })).toEqual({
      first: "2026-10-16",
      last: "2026-12-12",
      months: ["2026-10", "2026-11"],
    });
    expect(parseIndexSummary({ first: "x" })).toBeNull();
    expect(parseIndexSummary(null)).toBeNull();
  });
});

describe("publishedEntries", () => {
  it("hides every day after today, keeps today", () => {
    const list = [entry({ day: "2026-10-19" }), entry({ day: "2026-10-20" }), entry({ day: "2026-10-21" })];
    expect(publishedEntries(list, "2026-10-20").map((e) => e.day)).toEqual(["2026-10-19", "2026-10-20"]);
  });
});

describe("paths", () => {
  it("live under the feed so the apps' CORS header covers them", () => {
    expect(indexSummaryPath()).toBe("/daily-puzzles/index.json");
    expect(indexMonthPath("2026-10")).toBe("/daily-puzzles/index/2026-10.json");
  });
});

describe("fetchPublishedIndex / loadPublishedIndex", () => {
  const files: Record<string, unknown> = {
    "/daily-puzzles/index.json": { first: "2026-09-30", last: "2026-11-05", months: ["2026-09", "2026-10", "2026-11"] },
    "/daily-puzzles/index/2026-09.json": [entry({ day: "2026-09-30" })],
    "/daily-puzzles/index/2026-10.json": [entry({ day: "2026-10-20" }), entry({ day: "2026-10-21", slot: "midi" })],
    "/daily-puzzles/index/2026-11.json": [entry({ day: "2026-11-05" })],
  };
  const fetched: string[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    fetched.length = 0;
    resetDailyIndexMemory();
  });

  function stub(fail = false) {
    vi.stubGlobal("fetch", async (url: string) => {
      fetched.push(url);
      if (fail) return { ok: false, status: 500, json: async () => null };
      const body = files[url];
      return { ok: body !== undefined, status: body !== undefined ? 200 : 404, json: async () => body };
    });
  }

  it("fetches only the months that have started and filters to today", async () => {
    stub();
    const out = await fetchPublishedIndex("2026-10-20");
    expect(out?.map((e) => e.day)).toEqual(["2026-09-30", "2026-10-20"]);
    expect(fetched).toEqual(["/daily-puzzles/index.json", "/daily-puzzles/index/2026-09.json", "/daily-puzzles/index/2026-10.json"]);
  });

  it("is null when the summary cannot be read, and that is not cached", async () => {
    stub(true);
    expect(await fetchPublishedIndex("2026-10-20")).toBeNull();
    expect(await loadPublishedIndex("2026-10-20")).toBeNull();
    expect(knownPublishedIndex("2026-10-20")).toBeNull();
  });

  it("loadPublishedIndex remembers the day's answer and refetches for a new day", async () => {
    stub();
    expect(knownPublishedIndex("2026-10-20")).toBeNull();
    const first = await loadPublishedIndex("2026-10-20");
    expect(knownPublishedIndex("2026-10-20")).toBe(first);
    const calls = fetched.length;
    await loadPublishedIndex("2026-10-20");
    expect(fetched.length).toBe(calls);
    expect(knownPublishedIndex("2026-10-21")).toBeNull();
    const next = await loadPublishedIndex("2026-10-21");
    expect(next?.map((e) => e.day)).toEqual(["2026-09-30", "2026-10-20", "2026-10-21"]);
  });
});

describe("the committed index", () => {
  const root = decodeURIComponent(new URL("../../public/", import.meta.url).pathname);
  const readJson = (rel: string) => JSON.parse(new TextDecoder().decode(readFileSync(root + rel))) as unknown;
  const summary = readJson("daily-puzzles/index.json") as { first: string; last: string; months: string[] };

  it("matches the feed files on disk (run `pnpm build:daily-index` if this fails)", () => {
    const expected: DailyIndexEntry[] = [];
    for (const slot of DAILY_SLOTS) {
      // dailyFeedPath gives "/daily-puzzles[/slot]/<day>.json"; the directory is everything before the file.
      const dir = root + dailyFeedPath(slot, "0000-00-00").slice(1).replace(/[^/]+$/, "");
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file);
        if (!m) continue;
        const daily = parseDailyFeedEntry(readJson(dir.slice(root.length) + file));
        if (daily) expected.push(indexEntryFor(m[1], slot, daily));
      }
    }
    const sorted = sortEntries(expected);
    const actual = summary.months.flatMap((month) => parseIndexMonth(readJson(`daily-puzzles/index/${month}.json`)));
    expect(actual).toEqual(sorted);
    expect(summary.first).toBe(sorted[0].day);
    expect(summary.last).toBe(sorted[sorted.length - 1].day);
    expect(summary.months).toEqual([...new Set(sorted.map((e) => monthOf(e.day)))].sort());
  });
});
