/**
 * Publishes a puzzle to the daily feed for one calendar day.
 *
 *   pnpm daily:add 2026-11-01 path/to/puzzle.puz ["Theme"]
 *   pnpm daily:add --slot midi 2026-11-01 path/to/midi.ipuz ["Theme"]
 *   pnpm daily:add --slot large 2026-11-01 path/to/large.ipuz ["Theme"]
 *
 * Accepts anything the importer does (.puz/.ipuz/.jpz/.xd) and writes
 * public/daily-puzzles/<date>.json — or public/daily-puzzles/large/<date>.json
 * with `--slot large` — in the feed format (src/lib/dailyFeed.ts). The site
 * serves that puzzle as the day's daily for that slot once it is deployed:
 * the mini in place of the bundled rotation, the large where there would
 * otherwise be none. Re-running for a date and slot replaces its puzzle.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle, puzzleToTransferFormat } from "../src/lib/puzzleNormalizer";
import { dailyFeedPath, isDailySlot, parseDailyFeedEntry, type DailyFeedEntry, type DailySlot } from "../src/lib/dailyFeed";
import { buildDailyIndex } from "./build-daily-index.mts";

const USAGE = 'Usage: pnpm daily:add [--slot mini|midi|large] YYYY-MM-DD path/to/puzzle.(puz|ipuz|jpz|xd) ["Theme"]';

/** Pull `--slot X` / `--slot=X` out of the arguments; what's left is positional. */
function parseArgs(argv: string[]): { slot: DailySlot; rest: string[] } {
  let slot: DailySlot = "mini";
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = arg === "--slot" ? argv[++i] : arg.startsWith("--slot=") ? arg.slice("--slot=".length) : undefined;
    if (value === undefined) rest.push(arg);
    else if (isDailySlot(value)) slot = value;
    else {
      console.error(`Unknown slot "${value ?? ""}". ${USAGE}`);
      process.exit(1);
    }
  }
  return { slot, rest };
}

const { slot, rest } = parseArgs(process.argv.slice(2));
const [date, file, theme] = rest;
if (!date || !file || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
  console.error(USAGE);
  process.exit(1);
}

const raw = parse(fs.readFileSync(file), { filename: path.basename(file) });
const puzzle = normalizePuzzle(raw, path.basename(file));
const entry: DailyFeedEntry = { ...(theme ? { theme } : {}), puzzle: puzzleToTransferFormat(puzzle) };
if (!parseDailyFeedEntry(entry)) {
  console.error(`${file} did not survive conversion to the feed format.`);
  process.exit(1);
}

// dailyFeedPath gives the URL path; the file lives at the same path under public/.
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public", dailyFeedPath(slot, date).slice(1));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(entry) + "\n");
console.log(`${date} (${slot}): "${puzzle.title}" by ${puzzle.author || "unknown"} (${puzzle.width}×${puzzle.height}) → ${path.relative(process.cwd(), out)}`);
// The archive lists this day from the generated index, so rebuild it in the same step.
const index = buildDailyIndex();
console.log(`Archive index: ${index.entries} entries (${index.first} → ${index.last})`);
