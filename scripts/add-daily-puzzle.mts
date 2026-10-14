/**
 * Publishes a puzzle to the daily feed for one calendar day.
 *
 *   pnpm daily:add 2026-11-01 path/to/puzzle.puz ["Theme"]
 *
 * Accepts anything the importer does (.puz/.ipuz/.jpz/.xd) and writes
 * public/daily-puzzles/<date>.json in the feed format (src/lib/dailyFeed.ts).
 * The site serves that puzzle as the day's daily in place of the bundled
 * rotation once it is deployed. Re-running for a date replaces its puzzle.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle, puzzleToTransferFormat } from "../src/lib/puzzleNormalizer";
import { parseDailyFeedEntry, type DailyFeedEntry } from "../src/lib/dailyFeed";

const [date, file, theme] = process.argv.slice(2);
if (!date || !file || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
  console.error('Usage: pnpm daily:add YYYY-MM-DD path/to/puzzle.(puz|ipuz|jpz|xd) ["Theme"]');
  process.exit(1);
}

const raw = parse(fs.readFileSync(file), { filename: path.basename(file) });
const puzzle = normalizePuzzle(raw, path.basename(file));
const entry: DailyFeedEntry = { ...(theme ? { theme } : {}), puzzle: puzzleToTransferFormat(puzzle) };
if (!parseDailyFeedEntry(entry)) {
  console.error(`${file} did not survive conversion to the feed format.`);
  process.exit(1);
}

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/daily-puzzles");
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${date}.json`);
fs.writeFileSync(out, JSON.stringify(entry) + "\n");
console.log(`${date}: "${puzzle.title}" by ${puzzle.author || "unknown"} (${puzzle.width}×${puzzle.height}) → ${path.relative(process.cwd(), out)}`);
