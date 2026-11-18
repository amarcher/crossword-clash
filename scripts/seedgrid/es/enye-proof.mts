/**
 * Proof that the rebuilt engine takes Ñ as a letter (no digit stand-in):
 *   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs scripts/seedgrid/es/enye-proof.mts
 * 1. A 9×9 with ACOMPAÑAS locked: the fill must cross the Ñ with a Ñ word.
 * 2. The same word given through `approved` instead of locked letters.
 * 3. A grid row holding Ñ is a valid request (it was "bad-request" before).
 */
import fs from "node:fs";
import { initSync, Engine } from "../../../src/lib/seedgrid/wasm/seedgrid_engine.js";
import { IngridEngine } from "../../../src/lib/seedgrid/ingrid";
import { gridFromRows, gridToRows, MAX_SHARED, slotsOf, slotText } from "../../../src/lib/seedgrid/grid";

const dict = fs.readFileSync("artifacts/seedgrid-es/wordlist/es.dict", "utf8");
const keep3 = new Set(fs.readFileSync("scripts/seedgrid/es/keep3.txt", "utf8").split(/\s+/).filter(Boolean));
const rejected = dict.split("\n").map((l) => l.split(";")[0]).filter((w) => w.length === 3 && !keep3.has(w));
initSync({ module: fs.readFileSync("src/lib/seedgrid/wasm/seedgrid_engine_bg.wasm") });
const engine = new IngridEngine(new Engine(dict, MAX_SHARED, 21));
const pattern = ["...#.....", "...#.....", ".........", ".....#...", "###...###", "...#.....", ".........", ".....#...", ".....#..."];
const show = (label: string, res: ReturnType<IngridEngine["fill"]>) => {
  console.log(`\n${label}: ${res.ok ? "filled" : res.reason} (${Math.round(res.ms)} ms)`);
  if (!res.ok) return;
  console.log(gridToRows(res.grid).join("\n"));
  console.log("entries with Ñ:", slotsOf(res.grid).map((s) => `${s.id} ${slotText(res.grid, s)}`).filter((t) => t.includes("Ñ")).join(", "));
};

const locked = gridFromRows(pattern.map((r, i) => (i === 2 ? "ACOMPAÑAS" : r)));
show("1. ACOMPAÑAS locked in row 3", engine.fill(locked, { minScore: 50, rejected }, { timeoutMs: 8000, seed: 3 }));

const open = gridFromRows(pattern);
const row3 = slotsOf(open).find((s) => s.dir === "across" && s.cells[0] === 18)!;
show(`2. ACOMPAÑAS approved for ${row3.id}`, engine.fill(open, { minScore: 50, rejected, approved: { [row3.id]: ["ACOMPAÑAS"] } }, { timeoutMs: 8000, seed: 3 }));
show(`2b. CANCIONES approved for ${row3.id} (ASCII)`, engine.fill(open, { minScore: 50, rejected, approved: { [row3.id]: ["CANCIONES"] } }, { timeoutMs: 8000, seed: 3 }));
show("2c. CANCIONES locked", engine.fill(gridFromRows(pattern.map((r, i) => (i === 2 ? "CANCIONES" : r))), { minScore: 50, rejected }, { timeoutMs: 8000, seed: 3 }));
const h = engine.options(open, { minScore: 50, rejected, approved: { [row3.id]: ["CANCIONES"] } });
console.log("options with approval: ok", h.ok, "zero slots", Object.entries(h.counts).filter(([, n]) => n === 0).map(([id]) => id).join(" "));
