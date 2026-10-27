/**
 * What the account page (/account) lists, derived from what the app already
 * keeps: the account's solve rows (solveHistory.ts), the per-puzzle solo
 * progress store (soloProgress.ts, read the way /archive does through
 * `inProgressFrom`), the daily index and the classic manifest. Pure; the
 * screen does the reading.
 */
import type { ArchiveProgress } from "./archive";
import type { ClassicEntry } from "./classicLibrary";
import type { DailyIndexEntry } from "./dailyIndex";
import { isRecordedFinish, type SolveRow } from "./solveHistory";

/** A puzzle in progress that the page can name and resume. */
export type InProgressRow =
  | { kind: "daily"; key: string; entry: DailyIndexEntry; progress: ArchiveProgress }
  | { kind: "classic"; key: string; entry: ClassicEntry; progress: ArchiveProgress };

/**
 * The puzzles in progress, most recently touched first: every progress
 * record that names a published daily or a shipped classic. A record for a
 * puzzle the account has since solved is dropped (solved wins, as in the
 * archive), and a record for an imported file is skipped — nothing here can
 * load it, only the play screen's own saved session can.
 */
export function inProgressRows(
  inProgress: Readonly<Record<string, ArchiveProgress>>,
  bestTimes: Readonly<Record<string, number>>,
  dailies: readonly DailyIndexEntry[] | null | undefined,
  classics: readonly ClassicEntry[] | null | undefined,
): InProgressRow[] {
  const byDaily = new Map<string, DailyIndexEntry>();
  for (const e of dailies ?? []) if (!byDaily.has(e.identity)) byDaily.set(e.identity, e);
  const byClassic = new Map<string, ClassicEntry>();
  for (const e of classics ?? []) if (!byClassic.has(e.identity)) byClassic.set(e.identity, e);

  const rows: InProgressRow[] = [];
  for (const [key, progress] of Object.entries(inProgress)) {
    if (typeof bestTimes[key] === "number") continue;
    const daily = byDaily.get(key);
    if (daily) {
      rows.push({ kind: "daily", key, entry: daily, progress });
      continue;
    }
    const classic = byClassic.get(key);
    if (classic) rows.push({ kind: "classic", key, entry: classic, progress });
  }
  return rows.sort((a, b) => b.progress.updatedAt - a.progress.updatedAt || (a.kind === "daily" && b.kind === "daily" ? b.entry.day.localeCompare(a.entry.day) : 0));
}

/**
 * The account's recorded finishes, newest first, at most `max`. Streak-day
 * markers written by the one-time upload (`legacy:…` rows with no time) are
 * not finishes and never show.
 */
export function recentSolves(rows: readonly SolveRow[] | null | undefined, max = 20): SolveRow[] {
  return (rows ?? [])
    .filter(isRecordedFinish)
    .slice()
    .sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.completed_day.localeCompare(a.completed_day))
    .slice(0, max);
}

/** "Oct 20" within the current year, "Oct 20, 2025" otherwise. */
export function solveDate(day: string, locale: string, today: string = new Date().toISOString().slice(0, 10)): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const sameYear = today.slice(0, 4) === day.slice(0, 4);
  return new Intl.DateTimeFormat(locale, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" }).format(new Date(y, m - 1, d));
}
