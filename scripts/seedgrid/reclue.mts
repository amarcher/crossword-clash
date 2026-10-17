/**
 * Rewrite a finished puzzle's clues at a difficulty, with the CLI's checks,
 * fix pass and content review. Works on `pnpm seedgrid` output (puzzle.ipuz +
 * session.json) and `pnpm seedgrid:large` output (puzzle.ipuz + studio.json).
 *
 *   pnpm seedgrid:reclue <puzzleDir> easy|medium|hard [--only-missing] [--context "…"] [--model …]
 *
 * `--only-missing` writes clues only for slots without one (after a refix);
 * the rest keep theirs. `--context` passes dated hooks the writer may use
 * where an entry fits. The previous clues stay in review.md for reference.
 */
import path from "node:path";
import { auditClues, clueBudget } from "../../src/lib/seedgrid/audit";
import { clueProblems, cluesRequest, CONTENT_RULE, contentReviewRequest, timelyContext, type ClueRow, type Difficulty } from "../../src/lib/seedgrid/cluePrompt";
import type { ClueSet } from "../../src/lib/seedgrid/ipuz";
import { callJson, DEFAULT_MODEL, usage } from "./claude.mts";
import { appendReview, loadPuzzleDir, parseArgs, savePuzzleDir, today } from "./puzzleDir.mts";

const USAGE = 'Usage: pnpm seedgrid:reclue <puzzleDir> easy|medium|hard [--only-missing] [--context "…"]';
const { flags, positional } = parseArgs(process.argv.slice(2));
const [dir, difficultyRaw] = positional;
if (!dir || !["easy", "medium", "hard"].includes(difficultyRaw ?? "")) {
  console.error(USAGE);
  process.exit(1);
}
const difficulty = difficultyRaw as Difficulty;
const onlyMissing = flags["only-missing"] === "true";
const extraContext = flags.context ?? "";
const model = flags.model ?? DEFAULT_MODEL;
const log = (m: string) => console.log(m);

const puzzle = loadPuzzleDir(dir);
const { grid, slots, answers, seeds } = puzzle;
const existing = puzzle.clues;
const wanted = (onlyMissing ? slots.filter((s) => !existing[s.id]?.standard) : slots).map((s) => s.id);
if (!wanted.length) {
  log("nothing to clue: every slot already has one");
  process.exit(0);
}

const themers = seeds.length && grid.width >= 11 ? `\nClue every theme entry (${seeds.join(", ")}) as a question-mark pun that plays on the mashup, e.g. TOUCHDOWNUNDER → "Six points scored in Australia?". The speed clue for a theme entry may be plainer.` : "";
const context = [puzzle.theme && `Theme idea: ${puzzle.theme}`, puzzle.title && `Title: ${puzzle.title}`, seeds.length && `Theme entries: ${seeds.join(", ")}`]
  .filter(Boolean)
  .join("\n") + `${themers}\n${CONTENT_RULE}${extraContext ? `\n${timelyContext(extraContext)}` : ""}`;

async function write(fix?: { slot: string; problem: string }[], only?: string[]): Promise<ClueRow[]> {
  const req = cluesRequest(grid, context, { difficulty, fix, slots: fix ? undefined : only });
  const { clues } = await callJson<{ clues: ClueRow[] }>({ model, ...req, maxTokens: Math.max(req.maxTokens, 12000) });
  return clues;
}
const take = (rows: ClueRow[], into: Record<string, ClueSet>, allow: (slot: string) => boolean) => {
  for (const r of rows) if (answers[r.slot] && allow(r.slot)) into[r.slot] = { standard: r.standard.trim(), speed: r.speed.trim() };
};

const clues: Record<string, ClueSet> = onlyMissing ? { ...existing } : {};
log(`Writing ${wanted.length} clue(s) at ${difficulty}…`);
let rows = await write(undefined, wanted);
let leftover: { slot: string; problem: string }[] = [];
for (let pass = 0; pass < 3; pass++) {
  take(rows, clues, (slot) => wanted.includes(slot));
  const missing = wanted.filter((id) => !clues[id]).map((slot) => ({ slot, problem: "no clue returned" }));
  const problems = [...clueProblems(answers, clues).filter((p) => wanted.includes(p.slot)), ...missing];
  if (!problems.length) break;
  if (pass < 2) {
    log(`  fixing ${problems.length}: ${problems.map((p) => `${p.slot} (${p.problem})`).join("; ")}`);
    rows = await write(problems);
  } else leftover = problems;
}
if (leftover.length) log(`  LEFT after the fix passes: ${leftover.map((p) => `${p.slot} (${p.problem})`).join("; ")}`);

// A second look at content and fairness, not mechanics: the fix pass rewrites what it flags.
// With --only-missing the kept clues are not up for review.
log("Reviewing clues…");
const reviewAnswers = onlyMissing ? Object.fromEntries(wanted.map((id) => [id, answers[id]])) : answers;
const { problems: content } = await callJson<{ problems: { slot: string; problem: string }[] }>({ model, ...contentReviewRequest(grid, context, reviewAnswers, clues) });
const flagged = content.filter((p) => reviewAnswers[p.slot]);
let afterContent: { slot: string; problem: string }[] = [];
if (flagged.length) {
  log(`  rewriting ${flagged.length} for content: ${flagged.map((p) => `${p.slot} ${answers[p.slot]}: ${p.problem}`).join("; ")}`);
  take(await write(flagged), clues, (slot) => flagged.some((p) => p.slot === slot));
  afterContent = clueProblems(answers, clues);
  if (afterContent.length) log(`  mechanical problems after the content rewrite: ${afterContent.map((p) => `${p.slot} (${p.problem})`).join("; ")}`);
}

const list = Object.entries(clues).map(([id, c]) => ({ slotId: id, answer: answers[id], clue: c.standard }));
const issues = auditClues(list, "standard clue");
for (const i of issues) log(`  [${i.severity}] ${i.message}`);

appendReview(dir, [
  `## Re-clue at ${difficulty} (${today()})`,
  "",
  `Model ${model}, tokens ${usage.input} in / ${usage.output} out. Budget: ${list.reduce((n, e) => n + e.clue.length, 0)} / ${clueBudget(list.length)} characters.${onlyMissing ? " Only the slots without a clue were written." : ""}${extraContext ? ` Hooks offered: ${extraContext}` : ""}`,
  ...(leftover.length ? ["", `Clue problems left after the fix passes: ${leftover.map((p) => `${p.slot} (${p.problem})`).join("; ")}`] : []),
  ...(flagged.length ? ["", `Content review flagged: ${flagged.map((p) => `${p.slot} ${answers[p.slot]} (${p.problem})`).join("; ")}`] : []),
  ...(afterContent.length ? [`Mechanical problems after the content rewrite: ${afterContent.map((p) => `${p.slot} (${p.problem})`).join("; ")}`] : []),
  ...issues.map((i) => `- [${i.severity}] ${i.message}`),
  "",
  "| Slot | Answer | Standard | Speed | Previous |",
  "|---|---|---|---|---|",
  ...slots.map((s) => `| ${s.id} | ${answers[s.id]}${seeds.includes(answers[s.id]) ? " (theme)" : ""} | ${clues[s.id]?.standard ?? ""} | ${clues[s.id]?.speed ?? ""} | ${wanted.includes(s.id) ? existing[s.id]?.standard ?? "" : "(kept)"} |`),
]);
savePuzzleDir(puzzle, { clues, difficulty });
log(`done: ${Object.keys(clues).length}/${slots.length} clues, ${issues.filter((i) => i.severity === "block").length} block(s) → ${path.join(dir, "puzzle.ipuz")}`);
