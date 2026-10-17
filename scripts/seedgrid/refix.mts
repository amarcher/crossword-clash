/**
 * Replace a forced entry in a finished puzzle: reject it, blank its
 * neighbourhood (its crossings, then theirs, then one ring more), refill with
 * the Ingrid engine, rank the results, and optionally write the best back.
 *
 *   pnpm seedgrid:refix <puzzleDir> <WORD> [--floor 50] [--apply] [--tries 12] [--dict path]
 *
 * Candidates are ranked by their weakest new entry's list score, then fill
 * quality (`scoreFill`), then the size of the change; a deeper ring is only
 * tried while no candidate's weakest replacement reaches 60. With `--apply`
 * the grid is written to puzzle.ipuz (+ studio.json / session.json), the
 * rejected word is recorded, the clues of changed slots are dropped, and
 * review.md gets an "Editor fix" section. Then run
 * `pnpm seedgrid:reclue <puzzleDir> <difficulty> --only-missing`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initSync, Engine } from "../../src/lib/seedgrid/wasm/seedgrid_engine.js";
import { IngridEngine } from "../../src/lib/seedgrid/ingrid";
import { gridToRows, MAX_SHARED, slotsOf, slotText } from "../../src/lib/seedgrid/grid";
import { normalizeEntry, parseDict } from "../../src/lib/seedgrid/dictionary";
import { nestedEntries, parseWordSet, scoreFill } from "../../src/lib/seedgrid/themedLarge";
import { blankSlots, candidateKey, changedEntries, depthSatisfied, lowestChangedScore, rankCandidates, ringSlots, type RefixCandidate } from "../../src/lib/seedgrid/refix";
import type { ClueSet } from "../../src/lib/seedgrid/ipuz";
import { appendReview, gridBlock, loadPuzzleDir, parseArgs, savePuzzleDir, today } from "./puzzleDir.mts";

const USAGE = "Usage: pnpm seedgrid:refix <puzzleDir> <WORD> [--floor 50] [--apply] [--tries 12]";
const { flags, positional } = parseArgs(process.argv.slice(2));
const [dir, badRaw] = positional;
if (!dir || !badRaw) {
  console.error(USAGE);
  process.exit(1);
}
const bad = normalizeEntry(badRaw);
const apply = flags.apply === "true";
const minScore = Number(flags.floor ?? 50);
const tries = Number(flags.tries ?? 12);
const log = (m: string) => console.log(m);

// ---- Word list + engine, as large.mts loads them ----
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dictPath = flags.dict ? path.resolve(flags.dict) : path.join(root, "public/seedgrid", process.env.SEEDGRID_WORD_LIST === "base" ? "words.dict" : "words-production.dict");
if (!fs.existsSync(dictPath)) {
  console.error(`Missing ${path.relative(process.cwd(), dictPath)}. Run \`pnpm seedgrid:dict\` then \`pnpm seedgrid:studio-dict\` first.`);
  process.exit(1);
}
const dictText = fs.readFileSync(dictPath, "utf8");
const scores = new Map(parseDict(dictText).map((e) => [e.word, e.score]));
const banFile = path.join(here, "wordlists/ban.dict");
const ban = fs.existsSync(banFile) ? parseWordSet(fs.readFileSync(banFile, "utf8")) : new Set<string>();
const enableFile = path.join(root, "scripts/mini-generator/wordlists/enable1.txt");
const singleWords = fs.existsSync(enableFile) ? new Set(fs.readFileSync(enableFile, "utf8").split("\n").map((w) => w.trim().toUpperCase()).filter(Boolean)) : undefined;
const ctx = { scores, ban, singleWords, maxShared: MAX_SHARED };
initSync({ module: fs.readFileSync(path.join(root, "src/lib/seedgrid/wasm/seedgrid_engine_bg.wasm")) });
const engine = new IngridEngine(new Engine(dictText, MAX_SHARED, 21));

// ---- The puzzle ----
const puzzle = loadPuzzleDir(dir);
const { grid, slots } = puzzle;
const entries = (g: typeof grid) => slotsOf(g).map((s) => ({ slotId: s.id, answer: slotText(g, s), locked: s.cells.every((i) => g.locked[i]) }));
const target = slots.find((s) => slotText(grid, s) === bad);
if (!target) {
  console.error(`${bad} is not an entry of ${path.relative(process.cwd(), dir)}`);
  process.exit(1);
}
if (target.cells.every((i) => grid.locked[i])) {
  console.error(`${bad} (${target.id}) is a locked theme entry; refix only replaces engine fill`);
  process.exit(1);
}
log(`${bad} is ${target.id}; baseline quality ${scoreFill(entries(grid), ctx).total.toFixed(0)}`);
const rejected = [...new Set([...puzzle.rejected.map(normalizeEntry), ...ban, bad])];

// ---- Refill ring by ring ----
const cands: (RefixCandidate & { key: string })[] = [];
for (const depth of [1, 2, 3]) {
  const { grid: blank, freed } = blankSlots(grid, ringSlots(slots, target, depth));
  let ok = 0;
  for (let seed = 1; seed <= tries; seed++) {
    const res = engine.fill(blank, { minScore, rejected }, { timeoutMs: 8000, seed });
    if (!res.ok) continue;
    ok++;
    const es = entries(res.grid);
    if (nestedEntries(es, MAX_SHARED).length) continue;
    const score = scoreFill(es, ctx);
    if (score.banned.length) continue;
    const changed = changedEntries(grid, res.grid, scores);
    if (!changed.length) continue;
    const key = candidateKey(changed);
    if (!cands.some((c) => c.key === key)) cands.push({ grid: res.grid, total: score.total, changed, depth, key });
  }
  log(`depth ${depth}: freed ${freed} cells, ${ok}/${tries} fills, ${cands.filter((c) => c.depth === depth).length} distinct`);
  if (depthSatisfied(cands, depth)) break;
}
const ranked = rankCandidates(cands);
const describe = (c: RefixCandidate) => c.changed.map((e) => `${e.slotId}:${e.before}→${e.after}(${e.score ?? "?"})`).join(" ");
for (const c of ranked.slice(0, 8)) log(`  low ${lowestChangedScore(c.changed)} quality ${c.total.toFixed(0)} depth ${c.depth}: ${describe(c)}`);
if (!ranked.length) {
  log(`no alternative found at floor ${minScore}; try --floor ${minScore - 5} or a deeper change in the studio`);
  process.exit(1);
}
const pick = ranked[0];
log("");
log(gridToRows(pick.grid).join("\n"));
if (!apply) {
  log(`(dry run: add --apply to write this fill back)`);
  process.exit(0);
}

// ---- Apply: keep the clues of untouched slots, drop the rest ----
const changedIds = new Set(pick.changed.map((e) => e.slotId));
const clues: Record<string, ClueSet> = {};
for (const s of slotsOf(pick.grid)) if (!changedIds.has(s.id) && puzzle.clues[s.id]) clues[s.id] = puzzle.clues[s.id];
savePuzzleDir(puzzle, { grid: pick.grid, clues, rejected: [...new Set([...puzzle.rejected, bad])] });
appendReview(dir, [
  `## Editor fix (${today()})`,
  "",
  `Rejected ${bad} (${target.id}) and refilled its neighbourhood (depth ${pick.depth}) at floor ${minScore}: ${describe(pick)}. Quality ${pick.total.toFixed(0)}. Clues for the changed slots were dropped; rewrite them with \`pnpm seedgrid:reclue ${dir} ${puzzle.difficulty} --only-missing\`.`,
  "",
  ...gridBlock(pick.grid),
]);
log(`applied; ${Object.keys(clues).length} clues kept, ${changedIds.size} slot(s) need new clues:`);
log(`  pnpm seedgrid:reclue ${dir} ${puzzle.difficulty} --only-missing`);
