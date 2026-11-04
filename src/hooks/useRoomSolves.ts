import { useEffect, useMemo, useState } from "react";
import { fetchRoomSolves, type PriorSolve } from "../lib/roomSolves";

/**
 * The room's players who have finished its puzzle before, by user id, for a
 * lobby's roster. Asks once per (room, puzzle, roster): a join re-asks so the
 * newcomer's chip shows. Takes the session user's id (the TV layout lives
 * outside AuthProvider). Empty before the session user exists, without a
 * room or puzzle, and when the read fails (the chip is a convenience).
 */
export function useRoomSolves(userId: string | null | undefined, gameId: string | null | undefined, puzzleKey: string | null | undefined, playerIds: readonly string[]): Record<string, PriorSolve> {
  const roster = useMemo(() => [...playerIds].sort().join(","), [playerIds]);
  const [solves, setSolves] = useState<{ key: string; rows: Record<string, PriorSolve> } | null>(null);
  const key = gameId && puzzleKey ? `${gameId}|${puzzleKey}|${roster}` : null;

  useEffect(() => {
    if (!userId || !gameId || !puzzleKey || !key || roster === "") return;
    let live = true;
    fetchRoomSolves(gameId, puzzleKey)
      .then((rows) => {
        if (live) setSolves({ key, rows });
      })
      .catch(() => {
        if (live) setSolves({ key, rows: {} });
      });
    return () => {
      live = false;
    };
  }, [userId, gameId, puzzleKey, key, roster]);

  return key && solves?.key === key ? solves.rows : EMPTY;
}

const EMPTY: Record<string, PriorSolve> = {};
