/**
 * "Up next" after a finish — the retention loop the completion modal shows.
 *
 * Pure: the screen gathers today's dailies, the solver's best times and the
 * classic manifest; this decides what to offer, in order. Rules (navigation
 * audit §2, item 8):
 *
 *   1. today's dailies the solver hasn't finished, mini → midi → large;
 *   2. else one classic they haven't played (first in book order);
 *   3. else "Browse the library".
 *
 * The same "which dailies are still open" question feeds the fresh-puzzle
 * picker, so it is exported on its own.
 */
import { DAILY_SLOTS, type DailySlot } from "./dailyFeed";
import type { DailyMini } from "./dailyMinis";
import type { ClassicEntry } from "./classicLibrary";
import { puzzleIdentity } from "./soloStats";

/** Today's dailies by slot: undefined while the feed is unanswered, null when the slot has nothing today. */
export type TodaysDailies = Partial<Record<DailySlot, DailyMini | null | undefined>>;

export interface NextUpInput {
  dailies: TodaysDailies;
  /** `puzzleIdentity()` → best time: the solved set (local stats or the account's history). */
  bestTimes: Readonly<Record<string, number>>;
  /** Identity of the puzzle just finished — solved even before the stats catch up. */
  finishedKey?: string | null;
  /** The classic manifest; null while it hasn't loaded (then the library row is offered instead of a classic). */
  classics?: readonly ClassicEntry[] | null;
  /** Row cap (default 2). */
  max?: number;
}

export type NextUpItem =
  | { kind: "daily"; slot: DailySlot; daily: DailyMini }
  | { kind: "classic"; entry: ClassicEntry }
  | { kind: "library" };

export const NEXT_UP_MAX = 2;

/** Today's dailies the solver has not finished, in slot order. Unknown or absent slots are skipped. */
export function unsolvedDailies(
  dailies: TodaysDailies,
  bestTimes: Readonly<Record<string, number>>,
  finishedKey?: string | null,
): { slot: DailySlot; daily: DailyMini }[] {
  const out: { slot: DailySlot; daily: DailyMini }[] = [];
  for (const slot of DAILY_SLOTS) {
    const daily = dailies[slot];
    if (!daily) continue;
    const key = puzzleIdentity(daily.puzzle);
    if (key === finishedKey || key in bestTimes) continue;
    out.push({ slot, daily });
  }
  return out;
}

/** The first classic (book order) the solver has not played, or null. */
export function firstUnplayedClassic(
  classics: readonly ClassicEntry[],
  bestTimes: Readonly<Record<string, number>>,
  finishedKey?: string | null,
): ClassicEntry | null {
  return classics.find((e) => e.identity !== finishedKey && !(e.identity in bestTimes)) ?? null;
}

export function nextUpSuggestions(input: NextUpInput): NextUpItem[] {
  const max = input.max ?? NEXT_UP_MAX;
  if (max <= 0) return [];
  const dailies = unsolvedDailies(input.dailies, input.bestTimes, input.finishedKey);
  if (dailies.length > 0) {
    return dailies.slice(0, max).map(({ slot, daily }) => ({ kind: "daily", slot, daily }));
  }
  const classic = input.classics ? firstUnplayedClassic(input.classics, input.bestTimes, input.finishedKey) : null;
  if (classic) return [{ kind: "classic", entry: classic }];
  return [{ kind: "library" }];
}
