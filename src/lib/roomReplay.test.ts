import { describe, expect, it } from "vitest";
import { buildRoomReplay, roomReplayAt } from "./roomReplay";

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
