/**
 * Rewrites published clues that break the repeat rule: a clue that repeats,
 * word for word, a clue its answer had in any daily within the previous
 * CLUE_REPEAT_DAYS days (`repeatedClues` in src/lib/seedgrid/crosscheck.ts,
 * which `pnpm seedgrid:crosscheck` reports and dailyFeedRepeats.test.ts
 * enforces from CLUE_REPEAT_FROM on).
 *
 *   pnpm seedgrid:unrepeat <date-from> [<date-to>] [--dry] [--concurrency 6] [--model …]
 *
 * Works on the feed files in public/daily-puzzles/ in publication order, so a
 * rewrite always sees every clue before it; the writer is shown each answer's
 * clues from RECENT_DAYS either side, and a new clue that repeats one of them,
 * runs over CLUE_MAX, gives the answer away or reads the same as another clue
 * of the puzzle goes back for a fix (twice),
 * else the old clue stays and is reported. Puzzles that share no repeated
 * answer are written at the same time. Only the repeated clues change; the
 * grid, title and every other clue stay. A table of every change goes to
 * artifacts/unrepeat/.
 */
import fs from "node:fs";
import path from "node:path";
import type { DailySlot } from "../../src/lib/dailyFeed";
import { clueOk, cluesRequest, CONTENT_RULE, repeatsRecent, type ClueRow, type Difficulty, type RecentClues } from "../../src/lib/seedgrid/cluePrompt";
import { CLUE_MAX } from "../../src/lib/seedgrid/audit";
import { clueKey, dayRange, recentCluesFor, repeatedClues, rowsFromTransfer, type ClueRepeat } from "../../src/lib/seedgrid/crosscheck";
import { gridFromRows, slotsOf, slotText } from "../../src/lib/seedgrid/grid";
import { callJson, DEFAULT_MODEL, usage } from "./claude.mts";
import { feedUses, loadFeed, RECENT_DAYS, type FeedFile } from "./feedHistory.mts";
import { parseArgs, today } from "./puzzleDir.mts";

const USAGE = "Usage: pnpm seedgrid:unrepeat <YYYY-MM-DD> [<YYYY-MM-DD>] [--dry] [--concurrency 6] [--model …]";
const { flags, positional } = parseArgs(process.argv.slice(2));
const [from, to = from] = positional;
if (!from || ![from, to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
  console.error(USAGE);
  process.exit(1);
}
const dry = flags.dry === "true";
const model = flags.model ?? DEFAULT_MODEL;
const concurrency = Math.max(1, Number(flags.concurrency ?? 6));
const inRange = new Set(dayRange(from, to));
const log = (m: string) => console.log(m);

const feed = loadFeed();
const fileKey = (day: string, slot: DailySlot) => `${day}|${slot}`;
const files = new Map(feed.map((f) => [fileKey(f.day, f.slot), f]));

/** The register the slot was clued at: easy, the Sunday large medium (docs/daily-large-queue.md). */
function difficultyOf(f: FeedFile): Difficulty {
  return f.slot === "large" && new Date(`${f.day}T12:00:00Z`).getUTCDay() === 0 ? "medium" : "easy";
}

/** The rule's repeats in the range, grouped by puzzle in publication order. */
function pendingRepeats(): Map<string, ClueRepeat[]> {
  const out = new Map<string, ClueRepeat[]>();
  for (const r of repeatedClues(feedUses(feed))) {
    if (!inRange.has(r.use.day)) continue;
    const key = fileKey(r.use.day, r.use.slot);
    const list = out.get(key) ?? [];
    list.push(r);
    out.set(key, list);
  }
  return out;
}

interface Change {
  day: string;
  slot: DailySlot;
  id: string;
  answer: string;
  before: string;
  after: string;
}
const changes: Change[] = [];
const kept: { day: string; slot: DailySlot; id: string; answer: string; clue: string; why: string }[] = [];

async function rewrite(f: FeedFile, repeats: ClueRepeat[]): Promise<void> {
  const puzzle = f.entry.puzzle;
  const grid = gridFromRows(rowsFromTransfer(puzzle));
  const slots = new Map(slotsOf(grid).map((s) => [s.id, s]));
  const uses = feedUses(feed);
  const targets = repeats.flatMap((r) => {
    const id = `${r.use.number}${r.use.dir === "across" ? "A" : "D"}`;
    const slot = slots.get(id);
    if (!slot || slotText(grid, slot) !== r.use.answer) {
      kept.push({ day: f.day, slot: f.slot, id, answer: r.use.answer, clue: r.use.clue, why: "slot not found in the grid" });
      return [];
    }
    return [{ id, repeat: r }];
  });
  if (!targets.length) return;
  const recent: RecentClues = Object.fromEntries(targets.map((t) => [t.id, [...new Set([t.repeat.use.clue, ...recentCluesFor(uses, t.repeat.use.answer, f.day, f.slot, RECENT_DAYS)])]]));
  const context = [
    puzzle.title && `Title: ${puzzle.title}`,
    f.entry.theme && `Theme: ${f.entry.theme}`,
    `This puzzle is already published; only the entries listed below get a new clue, every other clue stays as it is.`,
    `These are ordinary fill entries: give each a clean, fair clue at the stated register on a familiar sense of the word. Do not bend a clue toward the title or theme.`,
    CONTENT_RULE,
  ]
    .filter(Boolean)
    .join("\n");
  const answers = Object.fromEntries(targets.map((t) => [t.id, t.repeat.use.answer]));
  // The puzzle's other clues, by key: a new clue may not read the same as one of them (2 Dec's large got "Besides" twice).
  const ownClues = new Map(uses.filter((u) => u.day === f.day && u.slot === f.slot).map((u) => [clueKey(u.clue), `${u.number}${u.dir === "across" ? "A" : "D"}`]));
  const problemOf = (id: string, clue: string | undefined): string | null => {
    if (!clue?.trim()) return "no clue returned";
    if (clue.length > CLUE_MAX) return `over ${CLUE_MAX} characters`;
    if (!clueOk(answers[id], clue)) return "gives the answer away or breaks a clue rule";
    const repeat = repeatsRecent(clue, recent[id]);
    if (repeat) return `repeats "${repeat}", which another daily used lately`;
    const twin = ownClues.get(clueKey(clue)) ?? Object.entries(chosen).find(([other, c]) => other !== id && clueKey(c) === clueKey(clue))?.[0];
    return twin && twin !== id ? `reads the same as ${twin}'s clue in this puzzle` : null;
  };
  const chosen: Record<string, string> = {};
  let fix: { slot: string; problem: string }[] | undefined;
  for (let pass = 0; pass < 3; pass++) {
    const wanted = fix ? fix.map((p) => p.slot) : targets.map((t) => t.id);
    const req = cluesRequest(grid, context, { slots: wanted, difficulty: difficultyOf(f), recent, fix });
    let rows: ClueRow[] = [];
    try {
      rows = (await callJson<{ clues: ClueRow[] }>({ model, ...req, maxTokens: Math.max(req.maxTokens, 4000) })).clues;
    } catch (e) {
      log(`  ${f.day} ${f.slot}: ${(e as Error).message}`);
    }
    for (const r of rows) {
      const clue = r.standard?.trim();
      if (wanted.includes(r.slot) && !problemOf(r.slot, clue)) chosen[r.slot] = clue;
    }
    fix = wanted.filter((id) => !chosen[id]).map((id) => ({ slot: id, problem: problemOf(id, rows.find((r) => r.slot === id)?.standard?.trim()) ?? "no clue returned" }));
    if (!fix.length) break;
  }
  for (const t of targets) {
    const { use } = t.repeat;
    const after = chosen[t.id];
    if (!after) {
      kept.push({ day: f.day, slot: f.slot, id: t.id, answer: use.answer, clue: use.clue, why: fix?.find((p) => p.slot === t.id)?.problem ?? "no clue" });
      continue;
    }
    puzzle.clues[use.dir][use.index] = `${use.number}. ${after}`;
    changes.push({ day: f.day, slot: f.slot, id: t.id, answer: use.answer, before: use.clue, after });
  }
  if (!dry) fs.writeFileSync(f.file, JSON.stringify(f.entry) + "\n");
  log(`${f.day} ${f.slot.padEnd(5)} ${targets.filter((t) => chosen[t.id]).length}/${targets.length} rewritten: ${targets.map((t) => `${t.id} ${t.repeat.use.answer} → ${chosen[t.id] ?? "(kept)"}`).join("; ")}`);
}

for (let round = 1; round <= 3; round++) {
  const pending = pendingRepeats();
  const total = [...pending.values()].reduce((n, l) => n + l.length, 0);
  log(`Round ${round}: ${total} repeated clue(s) in ${pending.size} puzzle(s)`);
  if (!total) break;
  const queue = [...pending.keys()];
  while (queue.length) {
    // A wave is puzzles whose repeated answers no earlier queued puzzle shares, so each rewrite still sees every clue before it.
    const blocked = new Set<string>();
    const wave: string[] = [];
    for (const key of queue) {
      const answers = pending.get(key)!.map((r) => r.use.answer);
      if (wave.length < concurrency && answers.every((a) => !blocked.has(a))) wave.push(key);
      for (const a of answers) blocked.add(a);
    }
    await Promise.all(wave.map((key) => rewrite(files.get(key)!, pending.get(key)!)));
    for (const key of wave) queue.splice(queue.indexOf(key), 1);
  }
  if (dry) break;
}

const left = [...pendingRepeats().values()].flat();
const outDir = path.resolve("artifacts/unrepeat");
fs.mkdirSync(outDir, { recursive: true });
const report = path.join(outDir, `${today()}-${from}-${to}.md`);
fs.writeFileSync(
  report,
  [
    `# Repeated clues rewritten, ${from} to ${to} (${today()})`,
    "",
    `Model ${model}, tokens ${usage.input} in / ${usage.output} out. ${changes.length} clue(s) rewritten, ${left.length} repeat(s) left.${dry ? " Dry run: no file was written." : ""}`,
    ...(kept.length ? ["", "## Kept", ...kept.map((k) => `- ${k.day} ${k.slot} ${k.id} ${k.answer} "${k.clue}": ${k.why}`)] : []),
    "",
    "| Day | Slot | Clue | Answer | Before | After |",
    "|---|---|---|---|---|---|",
    ...changes.map((c) => `| ${c.day} | ${c.slot} | ${c.id} | ${c.answer} | ${c.before.replace(/\|/g, "\\|")} | ${c.after.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n"),
);
log(`${changes.length} rewritten, ${left.length} repeat(s) left; report ${report}`);
if (left.length && !dry) process.exit(1);
