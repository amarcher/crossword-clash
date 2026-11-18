import { describe, expect, it } from "vitest";
import { mergeRaceProgress, progressPercent, rivalTintMap } from "./raceProgress";

describe("mergeRaceProgress", () => {
  it("keeps a player's longest list and ignores our own echo", () => {
    let p = mergeRaceProgress({}, "ann", ["0,0", "0,1"], "me");
    expect(p).toEqual({ ann: ["0,0", "0,1"] });
    // An older message arriving late changes nothing (same object back).
    expect(mergeRaceProgress(p, "ann", ["0,0"], "me")).toBe(p);
    expect(mergeRaceProgress(p, "me", ["0,0", "0,1", "0,2"], "me")).toBe(p);
    p = mergeRaceProgress(p, "ann", ["0,0", "0,1", "1,1"], "me");
    expect(p.ann).toHaveLength(3);
  });

  it("refuses a malformed payload", () => {
    const p = { ann: ["0,0"] };
    expect(mergeRaceProgress(p, 7, ["0,0", "0,1"], "me")).toBe(p);
    expect(mergeRaceProgress(p, "bo", "0,0", "me")).toBe(p);
    expect(mergeRaceProgress(p, "bo", ["0,0", 3, null], "me")).toEqual({ ann: ["0,0"], bo: ["0,0"] });
  });
});

describe("rivalTintMap", () => {
  const roster = [
    { userId: "me", color: "#111" },
    { userId: "ann", color: "#a00" },
    { userId: "bo", color: "#00b" },
  ];

  it("gives each square the colour of the first other player who has it", () => {
    const tints = rivalTintMap(roster, { me: ["2,2"], ann: ["0,0", "0,1"], bo: ["0,1", "1,1"] }, "me");
    expect([...tints]).toEqual([["0,0", "#a00"], ["0,1", "#a00"], ["1,1", "#00b"]]);
  });

  it("is empty when nobody has announced", () => {
    expect(rivalTintMap(roster, {}, "me").size).toBe(0);
  });
});

describe("progressPercent", () => {
  it("is null until a player has announced, and stops short of 100", () => {
    expect(progressPercent({}, "ann", 10)).toBeNull();
    expect(progressPercent({ ann: ["0,0", "0,1", "0,2"] }, "ann", 10)).toBe(30);
    expect(progressPercent({ ann: Array.from({ length: 10 }, (_, i) => `0,${i}`) }, "ann", 10)).toBe(99);
  });
});
