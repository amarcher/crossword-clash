import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({ calls: [] as { fn: string; args: unknown }[], answer: { data: null as unknown, error: null as null | { message: string } } }));
vi.mock("./supabaseClient", () => ({
  supabase: {
    rpc: (fn: string, args: unknown) => {
      rpc.calls.push({ fn, args });
      return Promise.resolve(rpc.answer);
    },
  },
}));
const { fetchRoomSolves, priorSolveChip } = await import("./roomSolves");

beforeEach(() => {
  rpc.calls = [];
  rpc.answer = { data: null, error: null };
});

describe("room solves", () => {
  it("asks the RPC for the room and puzzle, keys the answer by user id, and surfaces a refusal", async () => {
    rpc.answer = { data: [{ user_id: "a", mode: "solo" }, { user_id: "b", mode: "coop" }], error: null };
    expect(await fetchRoomSolves("g1", "civics|9x9|k")).toEqual({ a: { mode: "solo" }, b: { mode: "coop" } });
    expect(rpc.calls).toEqual([{ fn: "room_solves", args: { p_game_id: "g1", p_puzzle_key: "civics|9x9|k" } }]);
    rpc.answer = { data: null, error: { message: "friends:not_a_member" } };
    await expect(fetchRoomSolves("g2", "k")).rejects.toThrow("friends:not_a_member");
  });

  it("names the chip: a solo finish is Solved before, a race mode Raced before, an import or nothing is no chip", () => {
    expect(priorSolveChip({ mode: "solo" })).toBe("solved");
    expect(priorSolveChip({ mode: "versus" })).toBe("raced");
    expect(priorSolveChip({ mode: "async" })).toBe("raced");
    expect(priorSolveChip({ mode: "import" })).toBeNull();
    expect(priorSolveChip(undefined)).toBeNull();
  });
});
