/**
 * Streak repair (docs/plus-expansion-spec.md §4; Andrew, 2026-11-12: Plus
 * only, offered for 24 hours). When one missed day breaks a streak, solving
 * that day's daily during the next local day restores it, as if it never
 * broke. Miss two days and it is gone: by then the first is out of reach.
 *
 * An account's streak is derived from its `solves` rows, so a repair is one
 * more row: a marker for the missed day (`repair:` key, mode 'import', no
 * time), the same shape the pre-account import uses, written only by the
 * `repair_streak` RPC (migration 20261116000000_streak_repair.sql), which
 * checks Plus and the window. A device without an account keeps the same
 * repair in its local stats (soloStats.streakBreak).
 */
import { supabase } from "./supabaseClient";
import { countsForDailyStreak, streakFromDays, type SolveRow } from "./solveHistory";
import { dayKey, loadSoloStats, saveSoloStats, shiftDayKey, type SoloStats, type StreakState } from "./soloStats";

/** The repair on offer today: the missed day, and the streak it would save. */
export interface RepairOffer {
  day: string;
  streak: number;
}

export const REPAIR_KEY_PREFIX = "repair:";

/** From an account's history: yesterday was missed right after a streak, and today is the day to repair it. */
export function repairOfferFromRows(rows: readonly Pick<SolveRow, "mode" | "source" | "completed_day">[], today: string): RepairOffer | null {
  const days = new Set(rows.filter(countsForDailyStreak).map((r) => r.completed_day));
  const missed = shiftDayKey(today, -1);
  const before = shiftDayKey(today, -2);
  if (days.has(missed) || !days.has(before)) return null;
  const streak = streakFromDays([...days].filter((d) => d <= before)).current;
  return streak > 0 ? { day: missed, streak } : null;
}

/** From a device's own stats: the same question for a streak kept without an account. */
export function repairOfferFromStats(stats: Pick<SoloStats, "streak" | "streakBreak">, today: string): RepairOffer | null {
  const missed = shiftDayKey(today, -1);
  // Not played since the break: the stored run still ends the day before the missed one.
  if (stats.streak.lastPlayedDay === shiftDayKey(today, -2) && stats.streak.current > 0) return { day: missed, streak: stats.streak.current };
  // Played today already: the run was rolled back to 1, and the break remembers what it was.
  if (stats.streak.lastPlayedDay === today && stats.streakBreak?.day === missed) return { day: missed, streak: stats.streakBreak.before };
  return null;
}

/** The local streak with the missed day restored (pure). */
export function repairedStreak(stats: Pick<SoloStats, "streak" | "streakBreak">, today: string): StreakState | null {
  const offer = repairOfferFromStats(stats, today);
  if (!offer) return null;
  const { streak } = stats;
  const current = streak.lastPlayedDay === today ? offer.streak + 1 + streak.current : streak.current + 1;
  return { current, longest: Math.max(streak.longest, current), lastPlayedDay: streak.lastPlayedDay === today ? today : offer.day };
}

/** Repair this device's own streak; the new streak, or null when there was nothing to repair. */
export function repairLocalStreak(now: Date = new Date()): StreakState | null {
  const stats = loadSoloStats();
  const streak = repairedStreak(stats, dayKey(now));
  if (!streak) return null;
  const { streakBreak: _repaired, ...rest } = stats;
  saveSoloStats({ ...rest, streak });
  return streak;
}

/** The marker row a repair adds to an account's history (what repair_streak inserts). */
export function repairRow(day: string, puzzleKey: string, nowIso: string): SolveRow {
  return {
    puzzle_key: `${REPAIR_KEY_PREFIX}${puzzleKey}`.slice(0, 80),
    title: "",
    source: "daily",
    mode: "import",
    seconds: null,
    completed_day: day,
    completed_at: nowIso,
  };
}

export class RepairError extends Error {
  kind: "plus" | "nothing" | "failed";
  constructor(kind: RepairError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

/** Ask the server to repair the account's streak: true when the day now counts. */
export async function repairAccountStreak(day: string, puzzleKey: string, today: string): Promise<boolean> {
  if (!supabase) throw new RepairError("failed", "Supabase isn't configured in this build.");
  const { data, error } = await supabase.rpc("repair_streak", { p_day: day, p_puzzle_key: puzzleKey, p_today: today });
  if (error) {
    const kind = /repair:plus/.test(error.message) ? "plus" : /repair:nothing/.test(error.message) ? "nothing" : "failed";
    throw new RepairError(kind, error.message);
  }
  return data === true;
}
