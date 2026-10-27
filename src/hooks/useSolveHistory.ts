import { useMemo, useSyncExternalStore } from "react";
import { useMaybeAccount } from "../contexts/AccountContext";
import { useHydrated } from "../lib/hydration";
import { getSolveHistoryState, subscribeSolveHistory, type SolveHistoryState, type SolveRow, type SolveSummary } from "../lib/solveHistory";
import { dayKey, effectiveStreak, getDisplayNytStreak, getDisplayStreak, loadSoloStats } from "../lib/soloStats";

export interface SolveHistory {
  /** True when a real account is signed in (so the server is the source of truth). */
  signedIn: boolean;
  /** The account's derived history, or null while anonymous, loading, or after a failed load. */
  summary: SolveSummary | null;
  /** The account's solve rows as loaded (streak markers included), or null until they are. */
  rows: SolveRow[] | null;
  loading: boolean;
  failed: boolean;
}

/**
 * The signed-in solver's history, kept current across screens; null summary
 * for anonymous play, so callers fall back to the device's local stats.
 * Reads the per-session store that AccountProvider fills.
 */
export function useSolveHistory(): SolveHistory {
  const account = useMaybeAccount();
  const userId = account?.user?.id ?? null;
  const state = useSyncExternalStore<SolveHistoryState | null>(subscribeSolveHistory, getSolveHistoryState, () => null);
  const own = state && state.userId === userId ? state : null;
  return {
    signedIn: !!userId,
    summary: own?.status === "ready" ? own.summary : null,
    rows: own?.status === "ready" ? own.rows : null,
    loading: !!userId && (!own || own.status === "loading"),
    failed: own?.status === "error",
  };
}

/** Today's streaks to display: the account's when signed in and loaded, else this device's. */
export function useStreaks(): { daily: number; nyt: number } {
  const { summary } = useSolveHistory();
  // localStorage is per visitor, so the prerendered HTML shows no streak and
  // hydration must agree; the device's stats appear on the render right after.
  const hydrated = useHydrated();
  return useMemo(() => {
    if (summary) {
      const today = dayKey(new Date());
      return { daily: effectiveStreak(summary.streak, today), nyt: effectiveStreak(summary.nytStreak, today) };
    }
    if (!hydrated) return { daily: 0, nyt: 0 };
    return { daily: getDisplayStreak(), nyt: getDisplayNytStreak() };
  }, [summary, hydrated]);
}

const NO_TIMES: Record<string, number> = {};

/** Best times by puzzle identity: the account's when signed in and loaded, else this device's. */
export function useBestTimes(): Record<string, number> {
  const { summary } = useSolveHistory();
  const hydrated = useHydrated();
  return useMemo(() => summary?.bestTimes ?? (hydrated ? loadSoloStats().bestTimes : NO_TIMES), [summary, hydrated]);
}
