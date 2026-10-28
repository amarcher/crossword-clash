/**
 * Rebuilds the daily archive index from the feed files.
 *
 *   pnpm build:daily-index
 *
 * Reads every public/daily-puzzles/{,midi/,large/}YYYY-MM-DD.json and writes
 * public/daily-puzzles/index.json plus one index/YYYY-MM.json per month (see
 * src/lib/dailyIndex.ts for the shape). `pnpm build`, `pnpm dev` and
 * `pnpm daily:add` (which imports `buildDailyIndex`) run it, so a published
 * day is in the archive on the same deploy. The output is committed;
 * dailyIndex.test.ts fails if it drifts from the files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAILY_SLOTS, dailyFeedPath, parseDailyFeedEntry } from "../src/lib/dailyFeed";
import { indexEntryFor, monthOf, sortEntries, type DailyIndexEntry } from "../src/lib/dailyIndex";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.json$/;

export function buildDailyIndex(): { entries: number; months: number; first: string; last: string } {
  const entries: DailyIndexEntry[] = [];
  for (const slot of DAILY_SLOTS) {
    const dir = path.join(publicDir, path.dirname(dailyFeedPath(slot, "0000-00-00").slice(1)));
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const m = DAY_FILE.exec(file);
      if (!m) continue;
      const daily = parseDailyFeedEntry(JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
      if (!daily) {
        console.warn(`skipping ${slot}/${file}: not a playable puzzle`);
        continue;
      }
      entries.push(indexEntryFor(m[1], slot, daily));
    }
  }

  const sorted = sortEntries(entries);
  const byMonth = new Map<string, DailyIndexEntry[]>();
  for (const e of sorted) {
    const month = monthOf(e.day);
    byMonth.set(month, [...(byMonth.get(month) ?? []), e]);
  }

  const indexDir = path.join(publicDir, "daily-puzzles", "index");
  fs.rmSync(indexDir, { recursive: true, force: true });
  fs.mkdirSync(indexDir, { recursive: true });
  for (const [month, list] of byMonth) {
    fs.writeFileSync(path.join(indexDir, `${month}.json`), JSON.stringify(list) + "\n");
  }
  const summary = {
    first: sorted[0]?.day ?? "",
    last: sorted[sorted.length - 1]?.day ?? "",
    months: [...byMonth.keys()].sort(),
  };
  fs.writeFileSync(path.join(publicDir, "daily-puzzles", "index.json"), JSON.stringify(summary) + "\n");
  return { entries: sorted.length, months: byMonth.size, first: summary.first, last: summary.last };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = buildDailyIndex();
  console.log(`Wrote ${r.entries} entries across ${r.months} months (${r.first} → ${r.last})`);
}
