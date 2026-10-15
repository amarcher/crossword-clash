import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import { initSync, Engine } from "./wasm/seedgrid_engine";
import { checkWordListResponse, IngridEngine } from "./ingrid";
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
  });

  it("refuses over-long slots and bad characters without panicking, and keeps working", () => {
    const short = new IngridEngine(new Engine(LIST, 4, 15));
    expect(short.fill(gridFromRows([".".repeat(16)]), { minScore: 0 })).toMatchObject({ ok: false, reason: "bad-request" });
    expect(short.options(gridFromRows([".".repeat(16)]), { minScore: 0 }).ok).toBe(false);
    expect(short.fill(gridFromRows(["B?T"]), { minScore: 0 })).toMatchObject({ ok: false, reason: "bad-request" });
    // A length the list has no words of at all (below max_length) is just empty, not a crash.
    expect(short.fill(gridFromRows(["......."]), { minScore: 0 })).toMatchObject({ ok: false, reason: "unfillable" });
    expect(short.fill(gridFromRows(["...", "...", "..."]), { minScore: 50 }).ok).toBe(true);
  });

  it("points at the one slot with no option instead of marking every slot dead", () => {
    // 1A needs a Q word; the downs are fine on their own.
    const opts = engine.options(gridFromRows(["Q..", "...", "..."]), { minScore: 50 });
    expect(opts.ok).toBe(false);
    expect(opts.counts).toEqual({ "1A": 0 });
    // Arc consistency failing across the grid still reports every slot as 0.
    const dead = engine.options(gridFromRows(["...", "...", "..."]), { minScore: 56 });
    expect(dead.ok).toBe(false);
    expect(Object.keys(dead.counts)).toHaveLength(6);
    expect(Object.values(dead.counts).every((n) => n === 0)).toBe(true);
  });

  it("rejects word-list responses that are pages or errors", () => {
    expect(() => checkWordListResponse(200, "text/plain", "BAT;60\n")).not.toThrow();
    expect(() => checkWordListResponse(200, "text/html", "<!doctype html>")).toThrow(/HTML/);
    expect(() => checkWordListResponse(200, null, "  <html>")).toThrow(/HTML/);
    expect(() => checkWordListResponse(404, "text/plain", "")).toThrow(/404/);
  });

  it("classifies candidates by trying a full fill with each", () => {
    const grid = gridFromRows(["...", "...", "..."]);
    expect(engine.classify(grid, "1A", ["BAT", "CAT", "BATS"], { minScore: 50 })).toEqual({ BAT: "good", CAT: "nogood", BATS: "nogood" });
  });
});
