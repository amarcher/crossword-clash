/**
 * Checks the published daily feed, day by day, against the same-day rules:
 * no title that is an entry of its puzzle, no clue that is empty, over
 * CLUE_MAX characters or gives its answer away, and no entry of 4+ letters
 * shared between the day's mini, midi and large.
 *
 *   pnpm seedgrid:crosscheck <date-from> [<date-to>] [--strict]
 *
 * Reads public/daily-puzzles/{,midi/,large/}<day>.json (a slot with no file
 * is simply absent that day). Prints one line per day plus every problem, and
 * a total; `--strict` exits 1 when there is any.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAILY_SLOTS, dailyFeedPath, type DailyFeedEntry } from "../../src/lib/dailyFeed";
import { crosscheckDay, dayRange, type DayPuzzle } from "../../src/lib/seedgrid/crosscheck";
import { parseArgs } from "./puzzleDir.mts";

const USAGE = "Usage: pnpm seedgrid:crosscheck <YYYY-MM-DD> [<YYYY-MM-DD>] [--strict]";
const { flags, positional } = parseArgs(process.argv.slice(2));
const [from, to = from] = positional;
if (!from || ![from, to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
  console.error(USAGE);
  process.exit(1);
}
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

let total = 0;
let days = 0;
for (const day of dayRange(from, to)) {
  const puzzles: DayPuzzle[] = [];
  for (const slot of DAILY_SLOTS) {
    const file = path.join(publicDir, dailyFeedPath(slot, day).slice(1));
    if (!fs.existsSync(file)) continue;
    const entry = JSON.parse(fs.readFileSync(file, "utf8")) as DailyFeedEntry;
    puzzles.push({ slot, puzzle: entry.puzzle });
  }
  if (!puzzles.length) continue;
  days++;
  const report = crosscheckDay(day, puzzles);
  console.log(`${day}  ${report.present.map((p) => `${p.slot}: ${p.title} ${p.size} ${p.entries}w`).join(" | ")}`);
  for (const problem of report.problems) console.log(`  !! ${problem}`);
  total += report.problems.length;
}
console.log(`${days} day(s) checked, ${total} problem(s)`);
if (flags.strict === "true" && total) process.exit(1);
