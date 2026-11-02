import { describe, it, expect, vi } from "vitest";
import { gridFromRows, slotsOf, type Grid } from "./grid";
import type { EngineRules, FillOutcome } from "./ingrid";
import { deadSlots, diagnoseFill, fillProbes, lockedEntries, LOWEST_SCORE, MAX_PROBES } from "./fillDiagnosis";

/** POWER across and PLANE down, both the constructor's; the rest open. */
function power(): Grid {
  const g = gridFromRows(["POWER", "L....", "A....", "N....", "E...#"]);
  g.locked = g.cells.map((c) => !!c && c !== "#");
  return g;
}

const filled = (grid: Grid): FillOutcome => ({ ok: true, grid, ms: 1 });
const unfillable: FillOutcome = { ok: false, reason: "unfillable", ms: 1 };
const engine = (opts: { counts?: Record<string, number>; fills?: (grid: Grid, rules: EngineRules) => boolean }) => ({
  options: vi.fn(async () => ({ ok: true, counts: opts.counts ?? {} })),
  fill: vi.fn(async (grid: Grid, rules: EngineRules) => (opts.fills?.(grid, rules) ? filled(grid) : unfillable)),
});

describe("fill diagnosis", () => {
  it("names the slots the heatmap left with no option", () => {
    const g = gridFromRows(["POWER", "PLANE", ".....", ".....", "....#"]);
    expect(deadSlots(g, { "1D": 0, "2D": 12 }).map((s) => s.id)).toEqual(["1D"]);
    expect(deadSlots(g, {})).toEqual([]);
  });

  it("lists the constructor's complete entries, longest first", () => {
    const g = gridFromRows(["BAT..", "O....", "W....", "#....", "....."]);
    g.locked = g.cells.map((c, i) => !!c && c !== "#" && i !== 2); // T is an engine letter
    expect(lockedEntries(g).map((s) => s.id)).toEqual(["1D"]);
    expect(lockedEntries(power()).map((s) => s.id)).toEqual(["1A", "1D"]);
  });

  it("probes approvals, then each locked entry without its shared letters, then the score floor", () => {
    const rules: EngineRules = { minScore: 50, approved: { "2D": ["OBOE"] }, rejected: ["zzz"] };
    const probes = fillProbes(power(), rules);
    expect(probes.map((p) => p.kind)).toEqual(["approvals", "entry", "entry", "score"]);
    expect(probes[0].slot?.id).toBe("2D");
    expect(probes[0].rules.approved).toEqual({});
    // Clearing POWER keeps the P that PLANE also owns; the engine reasons from PLANE alone.
    const without = probes[1];
    expect(without.word).toBe("POWER");
    expect(without.grid.cells.slice(0, 5)).toEqual(["P", "", "", "", ""]);
    expect(without.grid.locked.slice(0, 5)).toEqual([true, false, false, false, false]);
    expect(without.rules).toBe(rules);
    expect(probes[2].word).toBe("PLANE");
    expect(probes[3]).toMatchObject({ kind: "score", from: 50, rules: { minScore: LOWEST_SCORE, rejected: ["zzz"] } });
    // The grid itself is untouched.
    expect(power().cells.slice(0, 5)).toEqual(["P", "O", "W", "E", "R"]);
  });

  it("skips the score probe at the lowest floor and caps the list", () => {
    expect(fillProbes(power(), { minScore: LOWEST_SCORE }).map((p) => p.kind)).toEqual(["entry", "entry"]);
    // Eleven locked rows kept apart by black rows: eleven entry probes plus the floor.
    const g = gridFromRows(Array.from({ length: 21 }, (_, i) => (i % 2 ? "#####" : "ABCDE")));
    g.locked = g.cells.map((c) => c !== "#");
    expect(fillProbes(g, { minScore: 50 }).length).toBe(MAX_PROBES);
    expect(fillProbes(g, { minScore: 50 }, 3).length).toBe(3);
  });

  it("reports a dead slot without probing", async () => {
    const g = gridFromRows(["POWER", "PLANE", ".....", ".....", "....#"]);
    const e = engine({ counts: { "1D": 0 } });
    const verdict = await diagnoseFill(g, { minScore: 50 }, e);
    expect(verdict.kind).toBe("dead");
    expect(verdict.cells).toEqual([0, 5, 10, 15, 20]);
    expect(verdict.message).toContain("Nothing fits 1D (PP...)");
    expect(e.fill).not.toHaveBeenCalled();
  });

  it("blames the first entry whose removal lets the grid fill", async () => {
    const e = engine({ fills: (grid) => grid.cells[1] === "" }); // only without POWER
    const verdict = await diagnoseFill(power(), { minScore: 50 }, e);
    expect(verdict.kind).toBe("culprit");
    expect(verdict.cells).toEqual(slotsOf(power()).find((s) => s.id === "1A")!.cells);
    expect(verdict.message).toContain("POWER (1A) is in the way");
    expect(e.fill).toHaveBeenCalledTimes(1);
  });

  it("blames approvals and the score floor, painting nothing for the floor", async () => {
    const rules: EngineRules = { minScore: 50, approved: { "2D": ["OBOE"] } };
    const byApproval = await diagnoseFill(power(), rules, engine({ fills: (_g, r) => !r.approved?.["2D"] }));
    expect(byApproval.kind).toBe("culprit");
    expect(byApproval.message).toContain("approved words for 2D");
    const byScore = await diagnoseFill(power(), { minScore: 50 }, engine({ fills: (_g, r) => r.minScore === LOWEST_SCORE }));
    expect(byScore.kind).toBe("culprit");
    expect(byScore.cells).toEqual([]);
    expect(byScore.message).toContain("score floor of 50, but it does at 30");
  });

  it("admits when no single change helps", async () => {
    const e = engine({});
    const verdict = await diagnoseFill(power(), { minScore: 50 }, e);
    expect(verdict).toMatchObject({ kind: "unknown", cells: [] });
    expect(verdict.message).toContain("No single entry is the cause");
    expect(e.fill).toHaveBeenCalledTimes(3);
  });

  it("lets a cancelled probe reject so Stop ends the search", async () => {
    const e = { options: vi.fn(async () => ({ ok: true, counts: {} })), fill: vi.fn(async () => Promise.reject(new Error("cancelled"))) };
    await expect(diagnoseFill(power(), { minScore: 50 }, e)).rejects.toThrow("cancelled");
  });
});
