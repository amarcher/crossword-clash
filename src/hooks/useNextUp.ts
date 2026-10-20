import { useEffect, useMemo, useState } from "react";
import { useDailyPuzzle } from "./useDailyMini";
import { useBestTimes } from "./useSolveHistory";
import { DAILY_SLOTS } from "../lib/dailyFeed";
import { knownClassicManifest, loadClassicManifest, type ClassicEntry } from "../lib/classicLibrary";
import { nextUpSuggestions, unsolvedDailies, type NextUpItem, type TodaysDailies } from "../lib/nextUp";

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
  const classics = useClassicManifest(enabled && settled && openDailies.length === 0);

  return useMemo(() => {
    if (!enabled) return [];
    if (openDailies.length === 0 && !settled) return [];
    return nextUpSuggestions({ dailies, bestTimes, finishedKey, classics });
  }, [enabled, openDailies.length, settled, dailies, bestTimes, finishedKey, classics]);
}
