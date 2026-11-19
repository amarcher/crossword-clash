import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useMaybeAccount } from "../contexts/AccountContext";
import { archiveWindowFor } from "../lib/archive";
import { loadPublishedIndex, type DailyIndexEntry } from "../lib/dailyIndex";
import type { DailySlot } from "../lib/dailyFeed";
import { fetchGroupSolves, freshCandidates, freshForAll } from "../lib/groupSolves";
import { plusEnabled } from "../lib/plus";
import { dayKey } from "../lib/soloStats";
import { playedBefore } from "../lib/solvedPuzzles";

/** How many are offered. */
const SHOWN = 3;

/**
 * Past dailies of one size that nobody about to play has finished: the
 * player, and with `gameId` the room's players and invited friends
 * (group_solves). Asked once per size as the picker shows it, never again as
 * players join (Andrew, 2026-11-19: the lobby's chips cover a late joiner).
 * `undefined` while loading; when the room cannot be asked, the player's own
 * unsolved ones.
 */
export function useFreshPuzzles(slot: DailySlot, gameId: string | null): DailyIndexEntry[] | undefined {
  const { user } = useAuth();
  const account = useMaybeAccount();
  const window = archiveWindowFor({
    plusOn: plusEnabled(),
    available: !!account?.available,
    ready: !!account?.ready,
    signedIn: !!account?.user,
    plus: !!account?.plus,
  });
  const userId = user?.id ?? null;
  const [found, setFound] = useState<{ key: string; entries: DailyIndexEntry[] } | null>(null);
  const key = `${slot}:${gameId ?? ""}:${userId ?? ""}:${window ?? "all"}`;

  useEffect(() => {
    let live = true;
    void (async () => {
      const today = dayKey(new Date());
      const candidates = freshCandidates((await loadPublishedIndex(today)) ?? [], slot, today, window, playedBefore);
      const solved = gameId && userId ? await fetchGroupSolves(candidates.map((e) => e.identity), { gameId }).catch(() => ({})) : {};
      if (live) setFound({ key, entries: freshForAll(candidates, solved, SHOWN) });
    })();
    return () => {
      live = false;
    };
  }, [key, slot, gameId, userId, window]);

  return found?.key === key ? found.entries : undefined;
}
