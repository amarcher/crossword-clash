import { useEffect, useState } from "react";
import { todaysDailySlot } from "../lib/dailyLeaderboard";
import { DAILY_SLOTS, knownDailyPuzzle, resolveDailyPuzzle, type DailySlot } from "../lib/dailyFeed";
import type { DailyMini } from "../lib/dailyMinis";
import type { Puzzle } from "../types/puzzle";

/**
 * Today's puzzle in a daily slot. Undefined only while the feed is being
 * asked for the first time today; null when the slot has no puzzle today
 * (only the large can be null — the mini falls back to the bundled rotation).
 */
export function useDailyPuzzle(slot: DailySlot): DailyMini | null | undefined {
  const [daily, setDaily] = useState<DailyMini | null | undefined>(() => knownDailyPuzzle(slot));
  const unknown = daily === undefined;

  useEffect(() => {
    // Re-read synchronously on a slot change so the previous slot's puzzle
    // never shows under the new slot's name.
    const ready = knownDailyPuzzle(slot);
    setDaily(ready);
    if (ready !== undefined) return;
    let alive = true;
    void resolveDailyPuzzle(slot).then((resolved) => {
      if (alive) setDaily(resolved);
    });
    return () => {
      alive = false;
    };
  }, [slot, unknown]);

  return daily;
}

/**
 * Today's daily mini — the remote feed's when it has one, else the bundled
 * rotation. Null only while the feed is being asked for the first time today.
 */
export function useDailyMini(): DailyMini | null {
  return useDailyPuzzle("mini") ?? null;
}

/**
 * Which daily the loaded puzzle is ("mini", "midi", "large", or null). Re-checks
 * once every slot's feed has answered, so a player who arrived straight on
 * a play screen (a race joiner, a refresh) is still matched against the
 * feed's puzzles.
 */
export function useTodaysDailySlot(
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells"> | null,
): DailySlot | null {
  const [slot, setSlot] = useState(() => todaysDailySlot(puzzle));

  useEffect(() => {
    let alive = true;
    setSlot(todaysDailySlot(puzzle));
    void Promise.all(DAILY_SLOTS.map((s) => resolveDailyPuzzle(s))).then(() => {
      if (alive) setSlot(todaysDailySlot(puzzle));
    });
    return () => {
      alive = false;
    };
  }, [puzzle]);

  return slot;
}

/** Whether the loaded puzzle is one of today's dailies. */
export function useIsTodaysDaily(
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells"> | null,
): boolean {
  return useTodaysDailySlot(puzzle) !== null;
}
