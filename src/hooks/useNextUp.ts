import { useEffect, useMemo, useState } from "react";
import { useDailyPuzzle } from "./useDailyMini";
import { useBestTimes } from "./useSolveHistory";
import { DAILY_SLOTS } from "../lib/dailyFeed";
import { knownClassicManifest, loadClassicManifest, type ClassicEntry } from "../lib/classicLibrary";
import { knownPublishedIndex, loadPublishedIndex, type DailyIndexEntry } from "../lib/dailyIndex";
import { nextUpSuggestions, unsolvedDailies, NEXT_UP_MAX, type NextUpItem, type TodaysDailies } from "../lib/nextUp";
import { dayKey } from "../lib/soloStats";

/** "YYYY-MM-DD" of the local day before `today`. */
function dayBefore(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/**
 * Yesterday's dailies from the archive index, loaded only when asked
 * (`wanted`): the modal needs them only once today's own dailies no longer
 * fill the list. Null until known; [] when yesterday had nothing or the
 * index could not be read.
 */
export function useYesterdayDailies(wanted: boolean): DailyIndexEntry[] | null {
  const today = dayKey(new Date());
  const yesterday = dayBefore(today);
  const [entries, setEntries] = useState<DailyIndexEntry[] | null>(() => knownPublishedIndex(today)?.filter((e) => e.day === yesterday) ?? null);
  useEffect(() => {
    if (!wanted || entries !== null) return;
    let alive = true;
    void loadPublishedIndex(today).then((list) => {
      if (alive) setEntries((list ?? []).filter((e) => e.day === yesterday));
    });
    return () => {
      alive = false;
    };
  }, [wanted, entries, today, yesterday]);
  return entries;
}

/** Today's three dailies, each undefined until its feed has answered. */
export function useTodaysDailies(): TodaysDailies {
  const mini = useDailyPuzzle("mini");
  const midi = useDailyPuzzle("midi");
  const large = useDailyPuzzle("large");
  return useMemo(() => ({ mini, midi, large }), [mini, midi, large]);
}

/**
 * The classic manifest, loaded only when asked (`wanted`): the completion
 * modal needs it only once every daily is done, so the solver who still has
 * a midi to play never pays for the fetch.
 */
export function useClassicManifest(wanted: boolean): ClassicEntry[] | null {
  const [entries, setEntries] = useState<ClassicEntry[] | null>(() => knownClassicManifest());
  useEffect(() => {
    if (!wanted || entries !== null) return;
    let alive = true;
    loadClassicManifest().then((list) => {
      if (alive) setEntries(list);
    });
    return () => {
      alive = false;
    };
  }, [wanted, entries]);
  return entries;
}

/**
 * What to offer after a finish (see `nextUpSuggestions`). Empty while the
 * feed hasn't said what today holds, so the modal never flashes a classic
 * before the midi it should have offered.
 */
export function useNextUp(finishedKey: string | null, enabled = true): NextUpItem[] {
  const dailies = useTodaysDailies();
  const bestTimes = useBestTimes();
  const settled = DAILY_SLOTS.every((slot) => dailies[slot] !== undefined);
  const openDailies = useMemo(
    () => (enabled ? unsolvedDailies(dailies, bestTimes, finishedKey) : []),
    [enabled, dailies, bestTimes, finishedKey],
  );
  // Yesterday's dailies fill the rows today's can't; the classics only once both are exhausted.
  const yesterday = useYesterdayDailies(enabled && settled && openDailies.length < NEXT_UP_MAX);
  const classics = useClassicManifest(enabled && settled && openDailies.length === 0 && yesterday !== null && yesterday.length === 0);

  return useMemo(() => {
    if (!enabled) return [];
    if (openDailies.length === 0 && !settled) return [];
    // Hold the list while yesterday is still being read, so a classic never shows before a daily it should have offered.
    if (openDailies.length < NEXT_UP_MAX && yesterday === null) return openDailies.map(({ slot, daily }) => ({ kind: "daily" as const, slot, daily }));
    return nextUpSuggestions({ dailies, bestTimes, finishedKey, yesterday, classics });
  }, [enabled, openDailies, settled, dailies, bestTimes, finishedKey, yesterday, classics]);
}
