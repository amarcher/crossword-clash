/**
 * Timely-clue pass: offer a finished puzzle its publish date's hooks and let
 * Claude rewrite only the clues where a current angle fits naturally.
 *
 *   pnpm seedgrid:timely <puzzleDir> <YYYY-MM-DD> [hooks.json] [--max 3] [--dry] [--model …]
 *
 * The hooks file (default docs/daily-hooks.json, see docs/daily-hooks.md) maps
 * a day to a sentence of light hooks. Every proposed rewrite goes through the
 * clue checks (`clueProblems`: length, answer given away, both tiers); the
 * accepted ones are written to puzzle.ipuz (+ studio.json / session.json) and
 * listed in a "Timely clues" section of review.md. `--dry` only prints them.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyRewrites, hooksFor, timelyRequest, vetRewrites, type DailyHooks, type Rewrite } from "../../src/lib/seedgrid/timely";
import { callJson, DEFAULT_MODEL, usage } from "./claude.mts";
import { appendReview, loadPuzzleDir, parseArgs, savePuzzleDir } from "./puzzleDir.mts";

const USAGE = "Usage: pnpm seedgrid:timely <puzzleDir> <YYYY-MM-DD> [hooks.json] [--max 3] [--dry]";
const here = path.dirname(fileURLToPath(import.meta.url));
const { flags, positional } = parseArgs(process.argv.slice(2));
const [dir, date, hooksArg] = positional;
if (!dir || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(USAGE);
  process.exit(1);
}
const hooksFile = path.resolve(hooksArg ?? path.join(here, "../../docs/daily-hooks.json"));
const max = Number(flags.max ?? 3);
const dry = flags.dry === "true";
const model = flags.model ?? DEFAULT_MODEL;

const hooks = hooksFor(JSON.parse(fs.readFileSync(hooksFile, "utf8")) as DailyHooks, date);
if (!hooks) {
  console.log(`${path.basename(dir)} ${date}: no hooks for that day in ${path.relative(process.cwd(), hooksFile)}; nothing to do`);
  process.exit(0);
}

const puzzle = loadPuzzleDir(dir);
const { rewrites } = await callJson<{ rewrites: Rewrite[] }>({
  model,
  ...timelyRequest(puzzle.grid, { date, hooks, clues: puzzle.clues, max, theme: puzzle.theme, title: puzzle.title, seeds: puzzle.seeds }),
});
const { accepted, rejected } = vetRewrites(puzzle.answers, rewrites, max);

console.log(`${path.basename(dir)} ${date}: ${accepted.length} timely rewrite(s)${rejected.length ? `, ${rejected.length} rejected (${rejected.map((r) => `${r.slot}: ${r.reason}`).join("; ")})` : ""}`);
for (const r of accepted) console.log(`  ${r.slot} ${puzzle.answers[r.slot]}: "${r.standard}" / "${r.speed}" — ${r.why}`);
console.log(`  tokens: ${usage.input} in / ${usage.output} out`);
if (dry || !accepted.length) process.exit(0);

savePuzzleDir(puzzle, { clues: applyRewrites(puzzle.clues, accepted) });
appendReview(dir, [
  `## Timely clues (${date})`,
  "",
  `Hooks: ${hooks}`,
  "",
  ...accepted.map((r) => `- ${r.slot} ${puzzle.answers[r.slot]}: "${r.standard}" / "${r.speed}" — ${r.why} (was "${puzzle.clues[r.slot]?.standard ?? ""}")`),
  ...(rejected.length ? ["", `Rejected by the clue checks: ${rejected.map((r) => `${r.slot} (${r.reason})`).join("; ")}`] : []),
]);
console.log(`→ ${path.join(dir, "puzzle.ipuz")} updated`);
