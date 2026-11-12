// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { CellState } from "../types/puzzle";
import {
  cleanEvents,
  diffCells,
  ghostAt,
  ghostTints,
  hasLetters,
  loadRace,
  loadTrace,
  MAX_EVENTS,
  raceResults,
  replaySpeed,
  saveRace,
  saveRaceIntent,
  saveTrace,
  takeRaceIntent,
  type Ghost,
  type TraceEvent,
} from "./race";

const cell = (letter: string): CellState => ({ letter, correct: true });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("recording", () => {
  it("records each square whose letter changed, with its index and the time", () => {
    const before = { "0,0": cell("A") };
    const after = { "0,0": cell("A"), "1,2": cell("B") };
    expect(diffCells(before, after, 5, 1234.6)).toEqual([[1235, 7, "B"]]);
  });

  it("records an erase as an empty letter, and an overwrite as the new letter", () => {
    const before = { "0,0": cell("A"), "0,1": cell("X") };
    const after = { "0,0": cell(""), "0,1": cell("Y") };
    expect(diffCells(before, after, 5, 10)).toEqual([[10, 0, ""], [10, 1, "Y"]]);
  });

  it("knows a grid with letters in it", () => {
    expect(hasLetters({})).toBe(false);
    expect(hasLetters({ "0,0": cell("") })).toBe(false);
    expect(hasLetters({ "0,0": cell("Q") })).toBe(true);
  });
});

describe("the ghost at a moment", () => {
  const ghost = { seconds: 3, events: [[500, 0, "C"], [1000, 1, "A"], [1500, 1, ""], [2000, 1, "O"], [2500, 2, "T"]] as TraceEvent[] };

  it("replays the events up to the racer's clock", () => {
    const frame = ghostAt(ghost, 1600);
    expect([...frame.filled]).toEqual([[0, "C"]]);
    expect(frame.played).toBe(3);
    expect(frame.finished).toBe(false);
  });

  it("is finished once the clock reaches the friend's time", () => {
    const frame = ghostAt(ghost, 3000);
    expect([...frame.filled]).toEqual([[0, "C"], [1, "O"], [2, "T"]]);
    expect(frame.finished).toBe(true);
  });

  it("plays a stripped recording (1 filled / 0 emptied) the same way, with no letters", () => {
    const stripped = { seconds: 2, events: [[100, 4, 1], [200, 4, 0], [300, 5, 1]] as TraceEvent[] };
    expect([...ghostAt(stripped, 5000).filled]).toEqual([[5, 1]]);
  });

  it("tints each filled square with the first ghost (in race order) to have it", () => {
    const ghosts: Ghost[] = [
      { userId: "a", name: "Ana", color: "#111111", seconds: 9, events: [[0, 0, 1]] },
      { userId: "b", name: "Bo", color: "#222222", seconds: 9, events: [[0, 0, 1], [0, 6, 1]] },
    ];
    const frames = ghosts.map((g) => ghostAt(g, 1));
    expect([...ghostTints(ghosts, frames, 5)]).toEqual([["0,0", "#111111"], ["1,1", "#222222"]]);
  });
});

describe("results", () => {
  it("compares the finish with each ghost, keeping its name and colour", () => {
    const ghosts: Ghost[] = [
      { userId: "a", name: "Ana", color: "#111111", seconds: 100, events: [] },
      { userId: "b", name: "Bo", color: "#222222", seconds: 60, events: [] },
    ];
    expect(raceResults(ghosts, 80)).toEqual([
      { outcome: "beat", deltaSeconds: 20, name: "Ana", color: "#111111" },
      { outcome: "lost", deltaSeconds: 20, name: "Bo", color: "#222222" },
    ]);
  });

  it("plays a replay in about 20 seconds, and never slower than 4×", () => {
    expect(replaySpeed(30)).toBe(4);
    expect(replaySpeed(300)).toBe(15);
  });
});

describe("cleaning a recording from the server", () => {
  it("keeps well-formed events in time order and drops the rest", () => {
    expect(cleanEvents([[200, 1, "B"], "junk", [100, 0, "A"], [50, -1, "X"], [60, 2, 7], [70, 3, 1]])).toEqual([
      [70, 3, 1],
      [100, 0, "A"],
      [200, 1, "B"],
    ]);
    expect(cleanEvents(null)).toEqual([]);
  });

  it("caps a recording at MAX_EVENTS", () => {
    expect(cleanEvents(Array.from({ length: MAX_EVENTS + 5 }, (_, i) => [i, 0, "A"]))).toHaveLength(MAX_EVENTS);
  });
});

describe("storage", () => {
  it("keeps the recording and the race for one puzzle at a time", () => {
    saveTrace({ key: "p1", events: [[1, 0, "A"]], partial: false });
    expect(loadTrace("p1")?.events).toEqual([[1, 0, "A"]]);
    expect(loadTrace("p2")).toBeNull();
    saveRace({ key: "p1", ghosts: [] });
    expect(loadRace("p1")).toEqual({ key: "p1", ghosts: [] });
    expect(loadRace("p2")).toBeNull();
  });

  it("hands a board's race intent over once, to the puzzle it names", () => {
    saveRaceIntent({ key: "p1", userIds: ["a", "b", "c", "d"] });
    expect(takeRaceIntent("p2")).toEqual([]);
    expect(takeRaceIntent("p1")).toEqual(["a", "b", "c"]);
    expect(takeRaceIntent("p1")).toEqual([]);
  });
});
