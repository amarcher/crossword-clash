import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { initSync, Engine } from "./wasm/seedgrid_engine";
import { IngridEngine } from "./ingrid";
import { gridFromRows, gridToRows } from "./grid";

// BAT/ORE/WED across with BOW/ARE/TED down (or its transpose) is the only full fill;
// CAT and OAR are decoys.
const LIST = ["BAT;60", "ORE;55", "WED;55", "BOW;60", "ARE;60", "TED;50", "CAT;60", "OAR;55", "EEL;40"].join("\n");

let engine: IngridEngine;
beforeAll(() => {
  initSync({ module: fs.readFileSync(decodeURIComponent(new URL("./wasm/seedgrid_engine_bg.wasm", import.meta.url).pathname)) });
  engine = new IngridEngine(new Engine(LIST, 4, 15));
});

describe("ingrid_core engine (wasm)", () => {
  it("loads the list", () => {
    expect(engine.wordCount).toBe(9);
  });

  it("fills an open grid with distinct dictionary words", () => {
    const res = engine.fill(gridFromRows(["...", "...", "..."]), { minScore: 50 });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect([["BAT", "ORE", "WED"], ["BOW", "ARE", "TED"]]).toContainEqual(gridToRows(res.grid));
  });

  it("keeps given letters and fixed entries that are not in the list", () => {
    const res = engine.fill(gridFromRows(["..T", "...", "..."]), { minScore: 50 });
    expect(res.ok && gridToRows(res.grid)).toEqual(["BAT", "ORE", "WED"]);
    const fixed = engine.fill(gridFromRows(["XYZ"]), { minScore: 0 });
    expect(fixed.ok && gridToRows(fixed.grid)).toEqual(["XYZ"]);
  });

  it("reports unfillable grids and honors the score floor", () => {
    expect(engine.fill(gridFromRows(["...", "...", "..."]), { minScore: 56 })).toMatchObject({ ok: false, reason: "unfillable" });
  });

  it("rejections and approvals constrain the fill", () => {
    expect(engine.fill(gridFromRows(["...", "...", "..."]), { minScore: 0, rejected: ["ted"] }).ok).toBe(false);
    const approved = engine.fill(gridFromRows(["...", "...", "..."]), { minScore: 0, approved: { "1A": ["CAT"] } });
    expect(approved.ok).toBe(false);
  });

  it("counts arc-consistent options per slot and lists survivors", () => {
    const opts = engine.options(gridFromRows(["...", "...", "..."]), { minScore: 50 }, "1A");
    expect(opts.ok).toBe(true);
    // Arc consistency prunes 8 three-letter words to those with live crossings; it is
    // weaker than search, which is what classify() is for.
    expect(opts.counts["1A"]).toBeGreaterThan(1);
    expect(opts.counts["1A"]).toBeLessThan(8);
    expect(opts.words?.map((w) => w.word)).toContain("BAT");
    expect(opts.words?.[0].score).toBe(60);
    const dead = engine.options(gridFromRows(["Q..", "...", "..."]), { minScore: 50 });
    expect(dead.ok).toBe(false);
    expect(Object.values(dead.counts).every((n) => n === 0)).toBe(true);
  });

  it("classifies candidates by trying a full fill with each", () => {
    const grid = gridFromRows(["...", "...", "..."]);
    expect(engine.classify(grid, "1A", ["BAT", "CAT", "BATS"], { minScore: 50 })).toEqual({ BAT: "good", CAT: "nogood", BATS: "nogood" });
  });
});
