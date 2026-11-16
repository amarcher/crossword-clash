import { describe, expect, it } from "vitest";
import { buildRoomReplay, roomReplayAt, roomReplayCode } from "./roomReplay";
import { decodeRaceReplay } from "./replayCode";

const cell = (letter: string, playerId: string | undefined, at?: number) => ({ letter, correct: true, playerId, at });

describe("buildRoomReplay", () => {
  const cells = {
    "0,0": cell("A", "ann", 11_000),
    "0,1": cell("B", "bob", 12_500),
    "1,0": cell("C", "ann", 19_000),
  };

  it("orders the claims on the race clock, from its start", () => {
    const replay = buildRoomReplay(cells, 10_000)!;
    expect(replay.events.map((e) => [e.ms, e.key, e.playerId])).toEqual([
      [1000, "0,0", "ann"],
      [2500, "0,1", "bob"],
      [9000, "1,0", "ann"],
    ]);
    expect(replay.durationMs).toBe(9000);
  });

  it("starts at the first claim when the start is unknown or, across two clocks, later than it", () => {
    expect(buildRoomReplay(cells)!.events[0].ms).toBe(0);
    expect(buildRoomReplay(cells, 11_400)!.durationMs).toBe(8000);
  });

  it("is not offered when a square has no time or no claimant, when nothing is claimed, or when the times all coincide", () => {
    expect(buildRoomReplay({ ...cells, "2,2": cell("D", "bob") })).toBeNull();
    expect(buildRoomReplay({ ...cells, "2,2": cell("D", undefined, 13_000) })).toBeNull();
    expect(buildRoomReplay({})).toBeNull();
    expect(buildRoomReplay({ "0,0": cell("A", "ann", 5), "0,1": cell("B", "bob", 5) })).toBeNull();
  });

  it("ignores a letter that is not a claim", () => {
    expect(buildRoomReplay({ ...cells, "2,2": { letter: "X", correct: false } })!.events).toHaveLength(3);
  });
});

describe("roomReplayAt", () => {
  it("shows the squares claimed so far in their claimant's name, and each player's count", () => {
    const replay = buildRoomReplay({ "0,0": cell("A", "ann", 1000), "0,1": cell("B", "bob", 2000), "1,0": cell("C", "ann", 5000) }, 0)!;
    expect(roomReplayAt(replay, 500)).toEqual({ cells: {}, counts: {} });
    const mid = roomReplayAt(replay, 2000);
    expect(Object.keys(mid.cells)).toEqual(["0,0", "0,1"]);
    expect(mid.cells["0,1"]).toEqual({ letter: "B", correct: true, playerId: "bob" });
    expect(mid.counts).toEqual({ ann: 1, bob: 1 });
    expect(roomReplayAt(replay, 5000).counts).toEqual({ ann: 2, bob: 1 });
  });
});

describe("roomReplayCode", () => {
  const puzzle = { width: 2, height: 2, cells: [[{ solution: "A" }, { solution: "B" }], [{ solution: "C" }, { solution: null }]] };
  const replay = buildRoomReplay({ "0,0": cell("A", "ann", 11_000), "0,1": cell("B", "bob", 12_500), "1,0": cell("C", "bob", 19_000) }, 10_000)!;
  const colors = { ann: "#3b82f6", bob: "#ef4444" };

  it("files the claims with players in standing order, most squares first", () => {
    const race = decodeRaceReplay(roomReplayCode(puzzle, replay, colors, "ann")!)!;
    // Bob holds two squares, so Bob is player 0.
    expect(race.colors).toEqual([[239, 68, 68], [59, 130, 246]]);
    expect(race.claims.map((c) => [c.cell, c.player])).toEqual([[0, 1], [1, 0], [2, 0]]);
    expect(race.seconds).toBe(9);
    expect(race.blocks).toEqual([false, false, false, true]);
  });

  it("gives nothing when a claimant has no colour", () => {
    expect(roomReplayCode(puzzle, replay, { ann: "#3b82f6" })).toBeNull();
  });
});
