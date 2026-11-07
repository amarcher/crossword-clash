/**
 * The published daily feed as clue history, for the clue writers: every clue
 * of every file under public/daily-puzzles/, and per slot of a grid the clues
 * its answer had in other dailies around the publish day. `pnpm seedgrid`,
 * `seedgrid:large` and `seedgrid:reclue` take `--day YYYY-MM-DD` and pass
 * these to the writer (cluePrompt's `recent`), so a new puzzle never hands
 * back a clue the feed has used lately; `seedgrid:unrepeat` rewrites the ones
 * already published.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DAILY_SLOTS, dailyFeedPath, type DailyFeedEntry, type DailySlot } from "../../src/lib/dailyFeed";
import { CLUE_REPEAT_DAYS, clueUses, recentCluesFor, type ClueUse } from "../../src/lib/seedgrid/crosscheck";
import type { RecentClues } from "../../src/lib/seedgrid/cluePrompt";
import { slotsOf, slotText, type Grid } from "../../src/lib/seedgrid/grid";

export const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

/** How far either side of the publish day the writer is shown an answer's clues: twice the rule, so a new clue is fresh, not just legal. */
export const RECENT_DAYS = CLUE_REPEAT_DAYS * 2;

export interface FeedFile {
  day: string;
  slot: DailySlot;
  file: string;
  entry: DailyFeedEntry;
}

/** Every published feed file, in day then slot order. */
export function loadFeed(): FeedFile[] {
  const out: FeedFile[] = [];
  for (const slot of DAILY_SLOTS) {
    const dir = path.join(publicDir, path.dirname(dailyFeedPath(slot, "2000-01-01")).slice(1));
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      if (!m) continue;
      const file = path.join(dir, name);
      out.push({ day: m[1], slot, file, entry: JSON.parse(fs.readFileSync(file, "utf8")) as DailyFeedEntry });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || DAILY_SLOTS.indexOf(a.slot) - DAILY_SLOTS.indexOf(b.slot));
}

export function feedUses(feed: readonly FeedFile[]): ClueUse[] {
  return feed.flatMap((f) => clueUses(f.day, f.slot, f.entry.puzzle));
}

/** Per slot id of `grid`, the clues its answer had in other dailies within `windowDays` of `day`. */
export function recentForGrid(uses: readonly ClueUse[], grid: Grid, day: string, slot: DailySlot, windowDays = RECENT_DAYS): RecentClues {
  const out: RecentClues = {};
  for (const s of slotsOf(grid)) {
    const answer = slotText(grid, s);
    if (answer.includes(".") || !answer) continue;
    const recent = recentCluesFor(uses, answer, day, slot, windowDays);
    if (recent.length) out[s.id] = recent;
  }
  return out;
}

/** `--day` checked, or a clear exit. */
export function parseDay(value: string | undefined, usage: string): string | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`--day wants YYYY-MM-DD. ${usage}`);
    process.exit(1);
  }
  return value;
}
