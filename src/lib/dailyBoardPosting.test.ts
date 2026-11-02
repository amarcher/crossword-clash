import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The board's writes go out only from the production origin or a native
 * app: previews and local dev share the production Supabase project, so a
 * test solve on either must never reach the live leaderboard.
 */

// A chainable PostgREST fake: every call records itself; `maybeSingle`
// resolves with the next scripted result and an awaited chain resolves empty.
const calls: { table: string; op: string; args: unknown[] }[] = [];
let results: { data: unknown; error: unknown }[] = [];
function chain(table: string) {
  const api: Record<string, unknown> = {};
  for (const op of ["select", "eq", "update", "upsert", "order", "limit"]) {
    api[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return api;
    };
  }
  api.maybeSingle = () => {
    calls.push({ table, op: "maybeSingle", args: [] });
    return Promise.resolve(results.shift() ?? { data: null, error: null });
  };
  api.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return api;
}
vi.mock("./supabaseClient", () => ({ supabase: { from: (table: string) => chain(table) } }));

let native = false;
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native } }));

const { submitDailyResult, updateDailyDisplayName, boardPostsHere } = await import("./dailyLeaderboard");

function servedFrom(origin: string) {
  vi.stubGlobal("window", { location: { origin } });
}

const finish = { day: "2026-10-27", slot: "mini" as const, userId: "u1", displayName: "Andy", mode: "solo" as const, seconds: 57 };

beforeEach(() => {
  calls.length = 0;
  results = [];
  native = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("board posting by origin", () => {
  it("posts a finish from the production site", async () => {
    servedFrom("https://crosswordclash.com");
    expect(boardPostsHere()).toBe(true);
    await submitDailyResult(finish);
    const upsert = calls.find((c) => c.op === "upsert");
    expect(upsert?.table).toBe("daily_results");
    expect(upsert?.args[0]).toMatchObject({ day: "2026-10-27", slot: "mini", user_id: "u1", display_name: "Andy", seconds: 57 });
  });

  it("posts from a native app whatever its WebView origin", async () => {
    native = true;
    servedFrom("capacitor://localhost");
    expect(boardPostsHere()).toBe(true);
    await submitDailyResult(finish);
    expect(calls.some((c) => c.op === "upsert")).toBe(true);
  });

  it("writes nothing from a preview deployment, not even the lookup", async () => {
    servedFrom("https://crossword-clash-git-leaderboard-amarchers-projects.vercel.app");
    expect(boardPostsHere()).toBe(false);
    await submitDailyResult(finish);
    await updateDailyDisplayName("2026-10-27", "u1", "Andy");
    expect(calls).toEqual([]);
  });

  it("writes nothing from local dev", async () => {
    servedFrom("http://localhost:5173");
    await submitDailyResult(finish);
    await updateDailyDisplayName("2026-10-27", "u1", "Andy");
    expect(calls).toEqual([]);
  });

  it("renames a row only from the production site", async () => {
    servedFrom("https://crosswordclash.com");
    await updateDailyDisplayName("2026-10-27", "u1", "Andrew", "large");
    const update = calls.find((c) => c.op === "update");
    expect(update?.args[0]).toEqual({ display_name: "Andrew" });
    expect(calls.filter((c) => c.op === "eq").map((c) => c.args)).toEqual([
      ["day", "2026-10-27"],
      ["slot", "large"],
      ["user_id", "u1"],
    ]);
  });
});
