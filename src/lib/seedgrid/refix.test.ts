import { describe, expect, it } from "vitest";
import { gridFromRows, slotsOf, slotText } from "./grid";
import { blankSlots, candidateKey, changedEntries, depthSatisfied, lowestChangedScore, rankCandidates, ringSlots, type RefixCandidate } from "./refix";

// A 5×5 with black corners: 1A ABLE sits in the top row, its crossings run down.
const rows = ["#ABLE", "SPINE", "TOTAL", "ONES#", "WED##"];
const grid = gridFromRows(rows);
const slots = slotsOf(grid);
const byId = (id: string) => slots.find((s) => s.id === id)!;

describe("ringSlots", () => {
  it("is the target alone at depth 0, its crossings at depth 1, and widens from there", () => {
    const target = byId("1A");
    expect(ringSlots(slots, target, 0).map((s) => s.id)).toEqual(["1A"]);
    const ring1 = ringSlots(slots, target, 1).map((s) => s.id);
    expect(ring1).toContain("1A");
    expect(ring1).toEqual(expect.arrayContaining(["1D", "2D", "3D", "4D"]));
    expect(ring1).not.toContain("5A");
    const ring2 = ringSlots(slots, target, 2).map((s) => s.id);
    expect(ring2).toEqual(expect.arrayContaining([...ring1, "5A", "7A"]));
    expect(ringSlots(slots, target, 3).length).toBeGreaterThanOrEqual(ring2.length);
  });

  it("keeps the target even when it is not in the slot list", () => {
    const stray = { id: "99A", number: 99, dir: "across" as const, cells: [1, 2, 3, 4] };
    expect(ringSlots(slots, stray, 1).map((s) => s.id)).toContain("99A");
  });
});

describe("blankSlots", () => {
  it("empties the unlocked cells of the given slots and counts them, leaving blacks and locks", () => {
    const locked = { ...grid, locked: grid.locked.slice() };
    for (const i of byId("5D").cells) locked.locked[i] = true;
    const { grid: blank, freed } = blankSlots(locked, [byId("1A")]);
    expect(slotText(blank, byId("1A"))).toBe("....");
    expect(freed).toBe(4);
    expect(slotText(locked, byId("1A"))).toBe("ABLE");
    const { grid: blank2, freed: freed2 } = blankSlots(locked, [byId("5D")]);
    expect(freed2).toBe(0);
    expect(slotText(blank2, byId("5D"))).toBe(slotText(locked, byId("5D")));
  });
});

describe("changedEntries", () => {
  it("lists the slots whose entry differs, with the new entry's list score", () => {
    const after = gridFromRows(["#ABLY", "SPINE", "TOTAL", "ONES#", "WED##"]);
    const scores = new Map([["ABLY", 55], ["EYELE", 40]]);
    const changed = changedEntries(grid, after, scores);
    expect(changed).toEqual([
      { slotId: "1A", before: "ABLE", after: "ABLY", score: 55 },
      { slotId: "4D", before: "EEL", after: "YEL", score: undefined },
    ]);
    expect(changedEntries(grid, grid, scores)).toEqual([]);
  });
});

describe("ranking", () => {
  const cand = (depth: number, total: number, scores: (number | undefined)[]): RefixCandidate => ({
    grid,
    depth,
    total,
    changed: scores.map((score, i) => ({ slotId: `${i}A`, before: "OLD", after: `NEW${i}`, score })),
  });

  it("lowestChangedScore treats an unlisted word as 0 and no change as unbounded", () => {
    expect(lowestChangedScore(cand(1, 0, [60, 45]).changed)).toBe(45);
    expect(lowestChangedScore(cand(1, 0, [60, undefined]).changed)).toBe(0);
    expect(lowestChangedScore([])).toBe(Infinity);
  });

  it("candidateKey ignores order so the same replacement set dedupes", () => {
    const a = cand(1, 0, [50, 60]).changed;
    expect(candidateKey(a)).toBe(candidateKey([...a].reverse()));
    expect(candidateKey(a)).not.toBe(candidateKey(cand(1, 0, [50]).changed));
  });

  it("rankCandidates puts the highest weakest-replacement first, then quality, then the smaller change, and no-ops last", () => {
    const weak = cand(1, 900, [45, 80]);
    const strongLowQuality = cand(2, 100, [60, 70]);
    const strongHighQuality = cand(2, 200, [60, 65]);
    const strongHighQualitySmaller = cand(2, 200, [60]);
    const noop = cand(1, 999, []);
    const ranked = rankCandidates([weak, noop, strongLowQuality, strongHighQuality, strongHighQualitySmaller]);
    expect(ranked).toEqual([strongHighQualitySmaller, strongHighQuality, strongLowQuality, weak, noop]);
  });

  it("depthSatisfied needs a real change at that depth whose weakest replacement meets the bar", () => {
    expect(depthSatisfied([cand(1, 0, [45, 70])], 1)).toBe(false);
    expect(depthSatisfied([cand(1, 0, [60, 70])], 1)).toBe(true);
    expect(depthSatisfied([cand(1, 0, [60, 70])], 2)).toBe(false);
    expect(depthSatisfied([cand(1, 0, [])], 1)).toBe(false);
    expect(depthSatisfied([cand(1, 0, [55])], 1, 50)).toBe(true);
  });
});
