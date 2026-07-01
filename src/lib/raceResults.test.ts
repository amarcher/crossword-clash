import { describe, it, expect } from "vitest";
import { allFinished, rankRaceStandings } from "./raceResults";

const roster = [
  { userId: "a", displayName: "Anna", color: "#f00" },
  { userId: "b", displayName: "Ben", color: "#0f0" },
  { userId: "c", displayName: "Cleo", color: "#00f" },
];

describe("rankRaceStandings", () => {
  it("ranks finishers by ascending time", () => {
    const rows = rankRaceStandings(roster, { a: 120, b: 60, c: 90 });
    expect(rows.map((r) => r.userId)).toEqual(["b", "c", "a"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("shares ranks on ties (competition ranking)", () => {
    const rows = rankRaceStandings(roster, { a: 60, b: 60, c: 90 });
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
  });

  it("lists still-solving players after finishers with null rank/time", () => {
    const rows = rankRaceStandings(roster, { b: 75 });
    expect(rows[0]).toMatchObject({ userId: "b", seconds: 75, rank: 1 });
    expect(rows[1]).toMatchObject({ userId: "a", seconds: null, rank: null });
    expect(rows[2]).toMatchObject({ userId: "c", seconds: null, rank: null });
  });

  it("handles an empty roster", () => {
    expect(rankRaceStandings([], {})).toEqual([]);
  });
});

describe("allFinished", () => {
  it("is true only when every player has a time", () => {
    expect(allFinished(roster, { a: 1, b: 2, c: 3 })).toBe(true);
    expect(allFinished(roster, { a: 1, b: 2 })).toBe(false);
  });

  it("is false for an empty roster", () => {
    expect(allFinished([], {})).toBe(false);
  });
});
