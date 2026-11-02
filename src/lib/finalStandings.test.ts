import { describe, it, expect } from "vitest";
import { buildFinalStandings, cellsClaimedBy, colorMapOf, mergeRosters } from "./finalStandings";

const alice = { userId: "alice", displayName: "Alice", color: "#3b82f6" };
const bob = { userId: "bob", displayName: "Bob", color: "#ef4444" };
const cara = { userId: "cara", displayName: "Cara", color: "#22c55e" };

const cells = {
  "0,0": { correct: true, playerId: "alice" },
  "0,1": { correct: true, playerId: "alice" },
  "0,2": { correct: true, playerId: "bob" },
  "1,0": { correct: false, playerId: "bob" },
  "1,1": { correct: true },
};

describe("mergeRosters", () => {
  it("lists the DB rows in join order, then presence-only players, and lets presence name a shared player", () => {
    const merged = mergeRosters([{ ...bob, displayName: "Bobby" }, cara], [alice, bob]);
    expect(merged.map((p) => p.userId)).toEqual(["alice", "bob", "cara"]);
    expect(merged[1].displayName).toBe("Bobby");
  });

  it("is the presence roster when the DB has nothing, and vice versa", () => {
    expect(mergeRosters([alice], [])).toEqual([alice]);
    expect(mergeRosters([], [bob])).toEqual([bob]);
  });
});

describe("cellsClaimedBy", () => {
  it("counts correct squares per claimant and ignores wrong or unclaimed ones", () => {
    expect([...cellsClaimedBy(cells)]).toEqual([
      ["alice", 2],
      ["bob", 1],
    ]);
  });
});

describe("buildFinalStandings", () => {
  it("versus: every player with their squares and colour, the top claimant the winner", () => {
    const s = buildFinalStandings([alice, bob, cara], cells, {}, "versus");
    expect(s.mode).toBe("versus");
    expect(s.players).toEqual([
      { ...alice, cellsClaimed: 2, raceSeconds: null },
      { ...bob, cellsClaimed: 1, raceSeconds: null },
      { ...cara, cellsClaimed: 0, raceSeconds: null },
    ]);
    expect(s.winnerIds).toEqual(["alice"]);
  });

  it("versus: a tie names every top claimant; an empty grid names nobody", () => {
    const tied = { "0,0": { correct: true, playerId: "alice" }, "0,1": { correct: true, playerId: "bob" } };
    expect(buildFinalStandings([alice, bob], tied, {}, "versus").winnerIds).toEqual(["alice", "bob"]);
    expect(buildFinalStandings([alice, bob], {}, {}, "versus").winnerIds).toEqual([]);
  });

  it("async: carries each finish time and the fastest finisher wins", () => {
    const s = buildFinalStandings([alice, bob, cara], {}, { alice: 90, bob: 75 }, "async");
    expect(s.players.map((p) => p.raceSeconds)).toEqual([90, 75, null]);
    expect(s.winnerIds).toEqual(["bob"]);
  });

  it("co-op: a team finish has no winner", () => {
    expect(buildFinalStandings([alice, bob], cells, {}, "coop").winnerIds).toEqual([]);
  });

  it("colorMapOf keys the colours by user id", () => {
    const s = buildFinalStandings([alice, bob], cells, {}, "versus");
    expect(colorMapOf(s)).toEqual({ alice: "#3b82f6", bob: "#ef4444" });
  });
});
