import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DailyIndexEntry } from "./dailyIndex";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("./supabaseClient", () => ({ supabase: { rpc } }));

import { FRESH_CANDIDATES, fetchGroupSolves, freshCandidates, freshForAll } from "./groupSolves";

const entry = (day: string, slot: DailyIndexEntry["slot"], identity = `${slot}-${day}`): DailyIndexEntry => ({
  day, slot, title: identity, theme: "", author: "", width: 9, height: 9, clues: 30, identity, blocks: "..",
});

beforeEach(() => rpc.mockReset());

describe("fetchGroupSolves", () => {
  it("asks about the listed puzzles for a room and groups the solvers by puzzle", async () => {
    rpc.mockResolvedValue({ data: [{ puzzle_key: "a", user_id: "u1" }, { puzzle_key: "a", user_id: "u2" }, { puzzle_key: "b", user_id: "u1" }], error: null });
    expect(await fetchGroupSolves(["a", "b", "c"], { gameId: "g" })).toEqual({ a: ["u1", "u2"], b: ["u1"] });
    expect(rpc).toHaveBeenCalledWith("group_solves", { p_game_id: "g", p_friend_ids: [], p_puzzle_keys: ["a", "b", "c"] });
  });

  it("asks nothing for no puzzles, and throws on a refusal", async () => {
    expect(await fetchGroupSolves([])).toEqual({});
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: { message: "friends:not_a_member" } });
    await expect(fetchGroupSolves(["a"], { gameId: "g" })).rejects.toThrow("friends:not_a_member");
  });
});

describe("freshCandidates", () => {
  const entries = [entry("2026-11-01", "midi"), entry("2026-11-17", "midi"), entry("2026-11-18", "mini"), entry("2026-11-18", "midi"), entry("2026-11-19", "midi")];

  it("keeps one size, before today, newest first, without the player's own finishes", () => {
    const got = freshCandidates(entries, "midi", "2026-11-19", null, (key) => key === "midi-2026-11-17");
    expect(got.map((e) => e.day)).toEqual(["2026-11-18", "2026-11-01"]);
  });

  it("leaves out days outside the player's archive window", () => {
    expect(freshCandidates(entries, "midi", "2026-11-19", 7, () => false).map((e) => e.day)).toEqual(["2026-11-18", "2026-11-17"]);
  });

  it("asks about a bounded number", () => {
    const many = Array.from({ length: 90 }, (_, i) => entry(`2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, "0")}`, "mini"));
    expect(freshCandidates(many, "mini", "2026-11-19", null, () => false)).toHaveLength(FRESH_CANDIDATES);
  });
});

describe("freshForAll", () => {
  it("drops any puzzle someone has finished and keeps the first few", () => {
    const candidates = [entry("d4", "midi", "k4"), entry("d3", "midi", "k3"), entry("d2", "midi", "k2"), entry("d1", "midi", "k1")];
    expect(freshForAll(candidates, { k3: ["u2"] }, 2).map((e) => e.identity)).toEqual(["k4", "k2"]);
  });
});
