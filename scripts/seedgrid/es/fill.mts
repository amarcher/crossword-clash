/**
 * Spanish spike: skeleton + candidate fills from the private Spanish list.
 *   node … scripts/seedgrid/es/fill.mts <name> '<json config>'
 * config: { size, seeds?: string[], rows?: string[] (a fixed pattern, "." open "#" black, letters locked),
 *           minScore, fills, seed, budgetMs?, approved?: {slotId: string[]}, keep?: number,
 *           strict?: boolean (drop fills with a same-root pair or over the conjugation budget) }
 * Ñ is a letter to the engine (rebuilt 2026-11-13), so words with Ñ can be locked or seeded.
 * Fills are ranked by the Spanish rules first (wordForms.ts: same-root pairs, then finite verb
 * forms over the budget), then by mean list score.
 */
import fs from "node:fs";
import path from "node:path";
import { initSync, Engine } from "../../../src/lib/seedgrid/wasm/seedgrid_engine.js";
import { IngridEngine } from "../../../src/lib/seedgrid/ingrid";
import { cloneGrid, gridFromRows, gridToRows, MAX_SHARED, meetsGridStandards, slotsOf, slotText, type Grid } from "../../../src/lib/seedgrid/grid";
import { findSkeleton } from "../../../src/lib/seedgrid/skeletonFinder";
import { mulberry32 } from "../../../src/lib/seedgrid/random";
import { conjugationBudgetFor, finiteForms, parseForms, sameRootGroups } from "../../../src/lib/seedgrid/wordForms";

const [name, json] = process.argv.slice(2);
const cfg = JSON.parse(json);
const listDir = "artifacts/seedgrid-es/wordlist";
const dictText = fs.readFileSync(path.join(listDir, "es.dict"), "utf8");
const scores = new Map(dictText.split("\n").filter(Boolean).map((l) => { const [w, s] = l.split(";"); return [w, Number(s)] as const; }));
const rejectFile = path.join(listDir, "reject.txt");
const enc = (w: string) => w.toUpperCase();
const forms = parseForms(fs.readFileSync(path.join(listDir, "es.forms.tsv"), "utf8"));
const lookup = (w: string) => forms.get(w);
const rejected = fs.existsSync(rejectFile) ? fs.readFileSync(rejectFile, "utf8").split(/\s+/).filter(Boolean).map(enc) : [];
const extraReject: string[] = (cfg.reject ?? []).map(enc);
// Spanish has few real three-letter words and the frequency data is full of three-letter noise, so threes are a whitelist.
const keep3 = new Set(fs.readFileSync("scripts/seedgrid/es/keep3.txt", "utf8").split(/\s+/).filter(Boolean).map(enc));
for (const w of scores.keys()) if (w.length === 3 && !keep3.has(w)) rejected.push(w);
initSync({ module: fs.readFileSync("src/lib/seedgrid/wasm/seedgrid_engine_bg.wasm") });
const engine = new IngridEngine(new Engine(dictText, MAX_SHARED, 21));
const rules = (minScore: number) => ({ minScore, rejected: [...rejected, ...extraReject], approved: cfg.approved });

let skeleton: Grid;
let floor = cfg.minScore;
const t0 = Date.now();
if (cfg.rows) {
  skeleton = gridFromRows(cfg.rows);
  skeleton.locked = skeleton.cells.map((c) => c !== "" && c !== "#");
} else {
  const found = findSkeleton(engine, { size: cfg.size, symmetry: "rotational", seeds: cfg.seeds ?? [], rules: { minScore: cfg.minScore, rejected: [...rejected, ...extraReject] }, attempts: 60, placement: cfg.placement ?? "auto" }, { random: mulberry32(cfg.seed ?? 1), budgetMs: cfg.budgetMs, floorSteps: cfg.floorSteps ?? [3, 6] });
  if (!found.grid) { console.log(`no skeleton after ${found.attempts} layouts, ${Date.now() - t0} ms`); process.exit(1); }
  skeleton = found.grid;
  floor = found.minScore;
  console.log(`skeleton after ${found.attempts} layouts in ${Date.now() - t0} ms, fills at floor ${floor}`);
}
console.log(gridToRows(skeleton).join("\n"));
console.log("standards", meetsGridStandards(skeleton), "blocks", skeleton.cells.filter((c) => c === "#").length, "slots", slotsOf(skeleton).length);

{
  const h = engine.options(skeleton, rules(floor));
  const tight = Object.entries(h.counts).sort((a, b) => a[1] - b[1]).slice(0, 10).map(([id, n]) => `${id}:${n}`);
  console.log("heatmap ok", h.ok, "tightest", tight.join(" "));
}
const reasons: Record<string, number> = {};
interface Cand { rows: string[]; mean: number; low: string[]; seed: number; ms: number; kin: string[]; maybeKin: string[]; finite: string[]; over: number }
const cands: Cand[] = [];
let fails = 0;
let strictDropped = 0;
for (let i = 0; i < (cfg.fills ?? 20); i++) {
  const seed = (cfg.seed ?? 1) * 1000 + i;
  const res = engine.fill(cloneGrid(skeleton), rules(floor), { timeoutMs: cfg.fillMs ?? 8000, seed });
  if (!res.ok) { fails++; reasons[res.reason] = (reasons[res.reason] ?? 0) + 1; continue; }
  const entries = slotsOf(res.grid).filter((s) => !s.cells.every((c) => skeleton.locked[c])).map((s) => slotText(res.grid, s));
  const sc = entries.map((e) => scores.get(e) ?? 0);
  const mean = sc.reduce((a, b) => a + b, 0) / sc.length;
  const low = entries.filter((e) => (scores.get(e) ?? 0) < 55).map((e) => `${e}:${scores.get(e) ?? 0}`);
  const rows = gridToRows(res.grid);
  // The rules judge the whole grid, locked entries included: a themer can be half of a same-root pair.
  const all = slotsOf(res.grid).map((s) => slotText(res.grid, s));
  const groups = sameRootGroups(all, lookup);
  const kin = groups.filter((g) => g.certain).map((g) => g.entries.join("/"));
  const maybeKin = groups.filter((g) => !g.certain).map((g) => g.entries.join("/") + "?");
  const finite = finiteForms(all, lookup);
  const over = Math.max(0, finite.length - (cfg.budget ?? conjugationBudgetFor(res.grid.width)));
  if (cfg.strict && (kin.length || over)) { strictDropped++; continue; }
  if (!cands.some((c) => c.rows.join() === rows.join())) cands.push({ rows, mean, low, seed, ms: res.ms, kin, maybeKin, finite, over });
}
cands.sort((a, b) => a.kin.length - b.kin.length || a.over - b.over || a.maybeKin.length - b.maybeKin.length || b.mean - a.mean);
console.log(`${cands.length} distinct fills, ${fails} failed${cfg.strict ? `, ${strictDropped} dropped by the Spanish rules` : ""}`, reasons);
console.log(`clean under the Spanish rules: ${cands.filter((c) => !c.kin.length && !c.over).length}`);
const out = path.join("artifacts/seedgrid-es/wordlist/work", `${name}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ cfg, floor, skeleton: gridToRows(skeleton), cands }, null, 1));
for (const c of cands.slice(0, cfg.keep ?? 3)) {
  const g = gridFromRows(c.rows);
  console.log(`\n# seed ${c.seed} mean ${c.mean.toFixed(1)} (${Math.round(c.ms)} ms)`);
  console.log(c.rows.join("\n"));
  console.log(slotsOf(g).map((s) => `${s.id} ${slotText(g, s)}`).join("  "));
  console.log("below 55:", c.low.join(" "));
  console.log("same root:", [...c.kin, ...c.maybeKin].join(" ") || "none", "| finite verbs:", c.finite.join(" ") || "none", c.over ? `(${c.over} over budget)` : "");
}
