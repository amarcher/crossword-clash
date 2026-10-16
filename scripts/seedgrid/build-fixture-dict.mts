/**
 * Writes src/lib/seedgrid/__fixtures__/words.dict: a small word list for the
 * engine-backed tests (CI has no production list). Every 3- and 4-letter word
 * at score 50+, a deterministic slice of the 5–7s, plus every word from real
 * fills of the test skeletons so those grids stay fillable. Sources and
 * licenses are the production list's (public/seedgrid/NOTICES.txt): the
 * Collaborative Word List (MIT), ENABLE (public domain), SCOWL (permissive).
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs scripts/seedgrid/build-fixture-dict.mts
 */
import fs from "node:fs";
import { initSync, Engine } from "../../src/lib/seedgrid/wasm/seedgrid_engine.js";
import { IngridEngine } from "../../src/lib/seedgrid/ingrid";
import { slotsOf, slotText, gridToRows } from "../../src/lib/seedgrid/grid";
import { findSkeleton } from "../../src/lib/seedgrid/skeletonFinder";
import { mulberry32 } from "../../src/lib/seedgrid/random";

const SOURCE = "public/seedgrid/words-production.dict";
const OUT = "src/lib/seedgrid/__fixtures__/words.dict";
const text = fs.readFileSync(SOURCE, "utf8");
const score = new Map<string, number>();
for (const line of text.split("\n")) {
  const [w, s] = line.split(";");
  if (w && s) score.set(w, Number(s));
}

// A deterministic slice: keep a word when a hash of it lands under the share for its length.
const hash = (w: string) => [...w].reduce((h, ch) => (Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0), 2166136261) / 4294967296;
const share: Record<number, [number, number]> = { 3: [50, 1], 4: [50, 1], 5: [60, 0.45], 6: [70, 0.3], 7: [80, 0.18] };
const keep = new Set<string>();
for (const [w, s] of score) {
  const rule = share[w.length];
  if (rule && s >= rule[0] && hash(w) < rule[1]) keep.add(w);
}
console.log(`slice: ${keep.size} words`);

initSync({ module: fs.readFileSync("src/lib/seedgrid/wasm/seedgrid_engine_bg.wasm") });
const engine = new IngridEngine(new Engine(text, 3, 21));
const cases = [
  { size: 9, seeds: ["STARFISH", "DEVILRAY"], runs: 3 },
  { size: 15, seeds: ["TOUCHDOWNUNDER", "GOALPOSTMALONE", "KICKOFFSPRING", "GOALLINEDANCE"], runs: 3 },
];
for (const c of cases) {
  for (let run = 1; run <= c.runs; run++) {
    const res = findSkeleton(engine, { size: c.size, symmetry: "rotational", seeds: c.seeds, rules: { minScore: 50 }, attempts: 60 }, { random: mulberry32(run), budgetMs: 60_000 });
    if (!res.grid) throw new Error(`no skeleton for ${c.seeds.join(",")} run ${run}`);
    const fill = engine.fill(res.grid, { minScore: res.minScore }, { timeoutMs: 20_000, seed: run });
    if (!fill.ok) throw new Error(`no fill for ${c.seeds.join(",")} run ${run}`);
    const words = slotsOf(fill.grid).map((s) => slotText(fill.grid, s));
    for (const w of words) if (score.has(w)) keep.add(w);
    console.log(`${c.size}×${c.size} run ${run}: floor ${res.minScore}, ${words.length} words\n${gridToRows(fill.grid).join("\n")}`);
  }
}
const lines = [...keep].sort().map((w) => `${w};${score.get(w)}`);
fs.writeFileSync(OUT, lines.join("\n") + "\n");
console.log(`wrote ${OUT}: ${lines.length} words`);
