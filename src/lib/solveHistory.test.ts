// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// A PostgREST-shaped fake: `from()` builders chain and resolve to whatever the
// test queued; `rpc()` records its calls and answers from `rpcResult`.
type Result = { data: unknown; error: { message: string } | null };
const rpcCalls: { fn: string; args: { p_solves: unknown } }[] = [];
let rpcResult: Result | ((args: { p_solves: unknown }) => Result) = { data: [], error: null };
let selectResult: Result = { data: [], error: null };
const selectCalls: { method: string; args: unknown[] }[] = [];

function chain(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "range"]) {
    self[method] = (...args: unknown[]) => {
      selectCalls.push({ method, args });
      return self;
    };
  }
  self.then = (resolve: (r: Result) => unknown) => Promise.resolve(selectResult).then(resolve);
  return self;
}

vi.mock("./supabaseClient", () => ({
  supabase: {
    from: () => chain(),
    rpc: (fn: string, args: { p_solves: unknown }) => {
      rpcCalls.push({ fn, args });
      const result = typeof rpcResult === "function" ? rpcResult(args) : rpcResult;
      return Promise.resolve(result);
    },
  },
}));

import {
  EMPTY_SUMMARY,
  LEGACY_KEY_PREFIX,
  MAX_IMPORTED_STREAK_DAYS,
  ensureSolveHistory,
  getSolveHistoryState,
  judgeSolve,
  legacyRowsFromStats,
  mergeRows,
  recordSolve,
  resetSolveHistoryForTests,
  streakFromDays,
  subscribeSolveHistory,
  summarizeSolves,
  uploadLocalHistory,
  type SolveRow,
} from "./solveHistory";
import { EMPTY_STATS, saveSoloStats, type SoloStats } from "./soloStats";

function row(overrides: Partial<SolveRow> & Pick<SolveRow, "puzzle_key" | "completed_day">): SolveRow {
  return { title: "", source: "other", mode: "solo", seconds: 100, completed_at: `${overrides.completed_day}T12:00:00.000Z`, ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  rpcCalls.length = 0;
  selectCalls.length = 0;
  rpcResult = { data: [], error: null };
  selectResult = { data: [], error: null };
  resetSolveHistoryForTests();
});

describe("streakFromDays", () => {
  it("is empty with no days", () => {
    expect(streakFromDays([])).toEqual({ current: 0, longest: 0, lastPlayedDay: null });
  });

  it("counts the run ending on the latest day and remembers the longest", () => {
    const streak = streakFromDays(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-11"]);
    expect(streak).toEqual({ current: 2, longest: 3, lastPlayedDay: "2026-10-11" });
  });

  it("ignores order, duplicates and malformed days", () => {
    expect(streakFromDays(["2026-10-02", "2026-10-01", "2026-10-02", "nope"])).toEqual({ current: 2, longest: 2, lastPlayedDay: "2026-10-02" });
  });
});

describe("summarizeSolves", () => {
  it("keeps the best time per puzzle across days and ignores untimed finishes", () => {
    const summary = summarizeSolves([
      row({ puzzle_key: "p1", completed_day: "2026-10-01", seconds: 120 }),
      row({ puzzle_key: "p1", completed_day: "2026-10-03", seconds: 90 }),
      row({ puzzle_key: "p1", completed_day: "2026-10-04", seconds: null, mode: "coop" }),
    ]);
    expect(summary.bestTimes).toEqual({ p1: 90 });
    expect(summary.solveCount).toBe(1);
  });

  it("counts solo finishes and daily finishes toward the daily streak, like the local stats", () => {
    const summary = summarizeSolves([
      row({ puzzle_key: "a", completed_day: "2026-10-01", mode: "solo", source: "other" }),
      row({ puzzle_key: "b", completed_day: "2026-10-02", mode: "coop", source: "daily", seconds: null }),
      row({ puzzle_key: "c", completed_day: "2026-10-03", mode: "versus", source: "other", seconds: null }),
    ]);
    expect(summary.streak).toEqual({ current: 2, longest: 2, lastPlayedDay: "2026-10-02" });
    expect(summary.nytStreak).toEqual({ current: 0, longest: 0, lastPlayedDay: null });
  });

  it("derives the NYT streak from NYT finishes in any mode", () => {
    const summary = summarizeSolves([
      row({ puzzle_key: "n1", completed_day: "2026-10-01", source: "nyt", mode: "solo" }),
      row({ puzzle_key: "n2", completed_day: "2026-10-02", source: "nyt", mode: "versus", seconds: null }),
    ]);
    expect(summary.nytStreak).toEqual({ current: 2, longest: 2, lastPlayedDay: "2026-10-02" });
  });

  it("counts imported best times but not imported streak markers as solves", () => {
    const summary = summarizeSolves([
      row({ puzzle_key: "old", completed_day: "2026-10-05", mode: "import", source: "other", seconds: 200 }),
      row({ puzzle_key: `${LEGACY_KEY_PREFIX}daily:2026-10-04`, completed_day: "2026-10-04", mode: "import", source: "daily", seconds: null }),
      row({ puzzle_key: `${LEGACY_KEY_PREFIX}daily:2026-10-05`, completed_day: "2026-10-05", mode: "import", source: "daily", seconds: null }),
    ]);
    expect(summary.solveCount).toBe(1);
    expect(summary.bestTimes).toEqual({ old: 200 });
    expect(summary.streak.current).toBe(2);
  });
});

describe("mergeRows", () => {
  it("keeps the best of a repeated (puzzle, day) and adds other days", () => {
    const merged = mergeRows(
      [row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 100, title: "", source: "other", mode: "import" })],
      [
        row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 80, title: "Mini", source: "daily", mode: "solo", completed_at: "2026-10-01T18:00:00.000Z" }),
        row({ puzzle_key: "p", completed_day: "2026-10-02", seconds: 95 }),
      ],
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]).toEqual({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 80, title: "Mini", source: "daily", mode: "solo", completed_at: "2026-10-01T18:00:00.000Z" });
  });

  it("lets a timed finish replace an untimed one but never the reverse", () => {
    const timed = row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 70, mode: "async" });
    const untimed = row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: null, mode: "coop" });
    expect(mergeRows([untimed], [timed])[0]).toMatchObject({ seconds: 70, mode: "async" });
    expect(mergeRows([timed], [untimed])[0]).toMatchObject({ seconds: 70, mode: "async" });
  });

  it("keeps the slower finish's mode when the time does not improve", () => {
    const first = row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 70, mode: "solo" });
    const slower = row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 90, mode: "async" });
    expect(mergeRows([first], [slower])[0]).toMatchObject({ seconds: 70, mode: "solo" });
  });
});

describe("judgeSolve", () => {
  it("calls a first solve a new best with no previous time", () => {
    const outcome = judgeSolve([], row({ puzzle_key: "p", completed_day: "2026-10-02", seconds: 60 }));
    expect(outcome).toMatchObject({ previousBest: null, bestSeconds: 60, isNewBest: true });
    expect(outcome.streak.current).toBe(1);
  });

  it("reports the beaten time and a continued streak", () => {
    const history = [row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 60 })];
    const outcome = judgeSolve(history, row({ puzzle_key: "p", completed_day: "2026-10-02", seconds: 50 }));
    expect(outcome).toMatchObject({ previousBest: 60, bestSeconds: 50, isNewBest: true });
    expect(outcome.streak).toMatchObject({ current: 2, lastPlayedDay: "2026-10-02" });
  });

  it("is not a new best when slower, and an untimed finish is never a best", () => {
    const history = [row({ puzzle_key: "p", completed_day: "2026-10-01", seconds: 60 })];
    expect(judgeSolve(history, row({ puzzle_key: "p", completed_day: "2026-10-02", seconds: 70 }))).toMatchObject({ previousBest: 60, bestSeconds: 60, isNewBest: false });
    expect(judgeSolve(history, row({ puzzle_key: "p", completed_day: "2026-10-02", seconds: null, mode: "coop" }))).toMatchObject({ isNewBest: false, bestSeconds: 60 });
  });

  it("gives the NYT streak as of the finish's day", () => {
    const history = [row({ puzzle_key: "n1", completed_day: "2026-10-01", source: "nyt" })];
    const outcome = judgeSolve(history, row({ puzzle_key: "n2", completed_day: "2026-10-02", source: "nyt" }));
    expect(outcome.nytStreak.current).toBe(2);
    const broken = judgeSolve(history, row({ puzzle_key: "n2", completed_day: "2026-10-05", source: "nyt" }));
    expect(broken.nytStreak.current).toBe(1);
  });
});

describe("legacyRowsFromStats", () => {
  const today = "2026-10-16";
  const now = "2026-10-16T20:00:00.000Z";

  it("turns best times into imported rows dated today that count toward no streak", () => {
    const rows = legacyRowsFromStats({ ...EMPTY_STATS, bestTimes: { a: 90, b: 45.9 } }, today, now);
    expect(rows).toEqual([
      { puzzle_key: "a", title: "", source: "other", mode: "import", seconds: 90, completed_day: today, completed_at: now },
      { puzzle_key: "b", title: "", source: "other", mode: "import", seconds: 45, completed_day: today, completed_at: now },
    ]);
    expect(summarizeSolves(rows).streak.current).toBe(0);
  });

  it("writes one marker per day of a live streak so the server derives the same number", () => {
    const stats: SoloStats = {
      ...EMPTY_STATS,
      streak: { current: 3, longest: 9, lastPlayedDay: "2026-10-15" },
      nytStreak: { current: 1, longest: 1, lastPlayedDay: today },
    };
    const rows = legacyRowsFromStats(stats, today, now);
    expect(rows.map((r) => r.puzzle_key)).toEqual([
      `${LEGACY_KEY_PREFIX}daily:2026-10-15`,
      `${LEGACY_KEY_PREFIX}daily:2026-10-14`,
      `${LEGACY_KEY_PREFIX}daily:2026-10-13`,
      `${LEGACY_KEY_PREFIX}nyt:2026-10-16`,
    ]);
    const summary = summarizeSolves(rows);
    expect(summary.streak).toMatchObject({ current: 3, lastPlayedDay: "2026-10-15" });
    expect(summary.nytStreak.current).toBe(1);
    expect(summary.solveCount).toBe(0);
  });

  it("carries nothing for a streak that is already broken", () => {
    const stats: SoloStats = { ...EMPTY_STATS, streak: { current: 5, longest: 5, lastPlayedDay: "2026-10-10" } };
    expect(legacyRowsFromStats(stats, today, now)).toEqual([]);
  });

  it("caps a corrupt or very long streak", () => {
    const stats: SoloStats = { ...EMPTY_STATS, streak: { current: 5000, longest: 5000, lastPlayedDay: today } };
    expect(legacyRowsFromStats(stats, today, now)).toHaveLength(MAX_IMPORTED_STREAK_DAYS);
  });

  it("skips best times that are not sane numbers", () => {
    const stats = { ...EMPTY_STATS, bestTimes: { ok: 10, neg: -1, nan: Number.NaN } } as SoloStats;
    expect(legacyRowsFromStats(stats, today, now).map((r) => r.puzzle_key)).toEqual(["ok"]);
  });
});

describe("uploadLocalHistory (once per account per device)", () => {
  it("uploads the device's history once and then never again for that account", async () => {
    saveSoloStats({ ...EMPTY_STATS, bestTimes: { a: 90 } });
    rpcResult = (args) => ({ data: (args.p_solves as SolveRow[]).map((r) => ({ user_id: "u1", ...r })), error: null });

    const first = await uploadLocalHistory("u1", new Date("2026-10-16T12:00:00"));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("record_solves");
    expect(rpcCalls[0].args.p_solves).toMatchObject([{ puzzle_key: "a", seconds: 90, mode: "import" }]);
    expect(first?.map((r) => r.puzzle_key)).toEqual(["a"]);
    expect(first?.[0]).not.toHaveProperty("user_id");

    await expect(uploadLocalHistory("u1")).resolves.toBeNull();
    expect(rpcCalls).toHaveLength(1);
  });

  it("uploads again for a different account on the same device", async () => {
    saveSoloStats({ ...EMPTY_STATS, bestTimes: { a: 90 } });
    await uploadLocalHistory("u1");
    await uploadLocalHistory("u2");
    expect(rpcCalls).toHaveLength(2);
  });

  it("does not mark a failed upload done, so it is retried", async () => {
    saveSoloStats({ ...EMPTY_STATS, bestTimes: { a: 90 } });
    rpcResult = { data: null, error: { message: "offline" } };
    await expect(uploadLocalHistory("u1")).rejects.toEqual({ message: "offline" });
    rpcResult = { data: [], error: null };
    await uploadLocalHistory("u1");
    expect(rpcCalls).toHaveLength(2);
    await uploadLocalHistory("u1");
    expect(rpcCalls).toHaveLength(2);
  });

  it("marks an empty history done without a round trip", async () => {
    await expect(uploadLocalHistory("u1")).resolves.toBeNull();
    saveSoloStats({ ...EMPTY_STATS, bestTimes: { late: 10 } });
    await expect(uploadLocalHistory("u1")).resolves.toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("the per-session store", () => {
  it("loads the account's rows, folds in the device's history, and summarizes", async () => {
    selectResult = { data: [row({ puzzle_key: "server", completed_day: "2026-10-15", seconds: 50 })], error: null };
    saveSoloStats({ ...EMPTY_STATS, bestTimes: { local: 90 } });
    rpcResult = (args) => ({ data: (args.p_solves as SolveRow[]).map((r) => ({ user_id: "u1", ...r })), error: null });
    const seen: string[] = [];
    subscribeSolveHistory(() => seen.push(getSolveHistoryState()?.status ?? "none"));

    await ensureSolveHistory("u1");

    const state = getSolveHistoryState();
    expect(state?.status).toBe("ready");
    expect(state?.summary.bestTimes).toEqual({ server: 50, local: 90 });
    expect(state?.summary.solveCount).toBe(2);
    expect(seen).toEqual(["loading", "ready"]);
    expect(selectCalls.find((c) => c.method === "eq")?.args).toEqual(["user_id", "u1"]);
  });

  it("is a no-op once loaded and reports a failed load", async () => {
    await ensureSolveHistory("u1");
    const before = selectCalls.length;
    await ensureSolveHistory("u1");
    expect(selectCalls.length).toBe(before);

    resetSolveHistoryForTests();
    selectResult = { data: null, error: { message: "offline" } };
    await ensureSolveHistory("u2");
    expect(getSolveHistoryState()).toMatchObject({ userId: "u2", status: "error", rows: null, summary: EMPTY_SUMMARY });
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("recordSolve", () => {
  it("judges against the loaded history, updates it at once, and writes through record_solves", async () => {
    selectResult = { data: [row({ puzzle_key: "p", completed_day: "2026-10-15", seconds: 80, source: "daily" })], error: null };
    rpcResult = (args) => ({ data: (args.p_solves as SolveRow[]).map((r) => ({ user_id: "u1", ...r })), error: null });
    const now = new Date("2026-10-16T09:30:00");

    const outcome = await recordSolve("u1", { puzzleKey: "p", title: "Mini", source: "daily", mode: "solo", seconds: 70.8 }, now);

    expect(outcome).toMatchObject({ previousBest: 80, bestSeconds: 70, isNewBest: true });
    expect(outcome?.streak.current).toBe(2);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_solves).toEqual([
      { puzzle_key: "p", title: "Mini", source: "daily", mode: "solo", seconds: 70, completed_day: "2026-10-16", completed_at: now.toISOString() },
    ]);
    expect(getSolveHistoryState()?.summary.bestTimes).toEqual({ p: 70 });
  });

  it("keeps the finish locally when the write fails, and answers null when nothing is loaded", async () => {
    rpcResult = { data: null, error: { message: "offline" } };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outcome = await recordSolve("u1", { puzzleKey: "p", title: "", source: "other", mode: "solo", seconds: 30 });
    expect(outcome?.isNewBest).toBe(true);
    expect(getSolveHistoryState()?.summary.bestTimes).toEqual({ p: 30 });

    resetSolveHistoryForTests();
    selectResult = { data: null, error: { message: "offline" } };
    await expect(recordSolve("u2", { puzzleKey: "p", title: "", source: "other", mode: "solo", seconds: 30 })).resolves.toBeNull();
    warn.mockRestore();
  });
});
