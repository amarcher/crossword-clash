import { useEffect, useState } from "react";
import { isTodaysDaily } from "../lib/dailyLeaderboard";
import { knownDailyMini, resolveDailyMini } from "../lib/dailyFeed";
import type { DailyMini } from "../lib/dailyMinis";
import type { Puzzle } from "../types/puzzle";

/**
 * Today's daily puzzle — the remote feed's when it has one, else the bundled
 * rotation. Null only while the feed is being asked for the first time today.
 */
export function useDailyMini(): DailyMini | null {
  const [mini, setMini] = useState<DailyMini | null>(() => knownDailyMini());

  useEffect(() => {
    if (mini) return;
    let alive = true;
    void resolveDailyMini().then((resolved) => {
      if (alive) setMini(resolved);
    });
    return () => {
      alive = false;
    };
  }, [mini]);

  return mini;
}

/**
 * Whether the loaded puzzle is today's daily. Re-checks once the feed has
 * answered, so a player who arrived straight on a play screen (a race joiner,
 * a refresh) is still matched against the feed's puzzle.
 */
export function useIsTodaysDaily(
  puzzle: Pick<Puzzle, "title" | "width" | "height" | "cells"> | null,
): boolean {
  const [isDaily, setIsDaily] = useState(() => isTodaysDaily(puzzle));

  useEffect(() => {
    let alive = true;
    setIsDaily(isTodaysDaily(puzzle));
    void resolveDailyMini().then(() => {
      if (alive) setIsDaily(isTodaysDaily(puzzle));
    });
    return () => {
      alive = false;
    };
  }, [puzzle]);

  return isDaily;
}
