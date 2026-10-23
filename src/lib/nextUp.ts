/**
 * "Up next" after a finish — the retention loop the completion modal shows.
 *
 * Pure: the screen gathers today's dailies, the solver's best times and the
 * classic manifest; this decides what to offer, in order. Rules (navigation
 * audit §2, item 8):
 *
 *   1. today's dailies the solver hasn't finished, mini → midi → large;
 *   2. then yesterday's unfinished dailies (from the archive index), same order;
 *   3. else one classic they haven't played (first in book order);
 *   4. else "Browse the library".
 *
 * The same "which dailies are still open" question feeds the fresh-puzzle
 * picker, so it is exported on its own.
 */
import { DAILY_SLOTS, type DailySlot } from "./dailyFeed";
import type { DailyMini } from "./dailyMinis";
import type { ClassicEntry } from "./classicLibrary";
import type { DailyIndexEntry } from "./dailyIndex";
import { puzzleIdentity } from "./soloStats";

const SLOT_ORDER: Record<DailySlot, number> = { mini: 0, midi: 1, large: 2 };

/** Today's dailies by slot: undefined while the feed is unanswered, null when the slot has nothing today. */
export type TodaysDailies = Partial<Record<DailySlot, DailyMini | null | undefined>>;

export interface NextUpInput {
  dailies: TodaysDailies;
  /** `puzzleIdentity()` → best time: the solved set (local stats or the account's history). */
  bestTimes: Readonly<Record<string, number>>;
  /** Identity of the puzzle just finished — solved even before the stats catch up. */
  finishedKey?: string | null;
  /** Yesterday's dailies from the archive index; null or absent while unknown (then none are offered). */
  yesterday?: readonly DailyIndexEntry[] | null;
  /** The classic manifest; null while it hasn't loaded (then the library row is offered instead of a classic). */
  classics?: readonly ClassicEntry[] | null;
  /** Row cap (default 2). */
  max?: number;
}

export type NextUpItem =
  | { kind: "daily"; slot: DailySlot; daily: DailyMini }
  /** A past daily (yesterday's) from the index; the screen fetches it by day + slot. */
  | { kind: "archive"; entry: DailyIndexEntry }
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

/** Yesterday's dailies the solver has not finished, in slot order (the index carries each one's identity). */
export function unsolvedYesterday(
  yesterday: readonly DailyIndexEntry[] | null | undefined,
  bestTimes: Readonly<Record<string, number>>,
  finishedKey?: string | null,
): DailyIndexEntry[] {
  return (yesterday ?? [])
    .filter((e) => e.identity !== finishedKey && !(e.identity in bestTimes))
    .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
}

export function nextUpSuggestions(input: NextUpInput): NextUpItem[] {
  const max = input.max ?? NEXT_UP_MAX;
  if (max <= 0) return [];
  const open: NextUpItem[] = [
    ...unsolvedDailies(input.dailies, input.bestTimes, input.finishedKey).map(({ slot, daily }): NextUpItem => ({ kind: "daily", slot, daily })),
    ...unsolvedYesterday(input.yesterday, input.bestTimes, input.finishedKey).map((entry): NextUpItem => ({ kind: "archive", entry })),
  ];
  if (open.length > 0) return open.slice(0, max);
  const classic = input.classics ? firstUnplayedClassic(input.classics, input.bestTimes, input.finishedKey) : null;
  if (classic) return [{ kind: "classic", entry: classic }];
  return [{ kind: "library" }];
}
