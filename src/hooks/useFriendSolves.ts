import { useEffect, useState } from "react";
import { useFriends } from "../contexts/FriendsContext";
import { fetchFriendSolves, type FriendSolve } from "../lib/friends";

/**
 * Which friends have already finished the puzzle a room or an invite is
 * about (spec §3.8), by user id. Asks once per puzzle key while the viewer is
 * a signed-in account with a username; empty otherwise, and empty when the
 * read fails (the chip is a convenience, never a gate).
 */
export function useFriendSolves(puzzleKey: string | null | undefined): Record<string, FriendSolve> {
  const { active } = useFriends();
  const [solves, setSolves] = useState<{ key: string; rows: Record<string, FriendSolve> } | null>(null);

  useEffect(() => {
    if (!active || !puzzleKey) return;
    let live = true;
    fetchFriendSolves(puzzleKey)
      .then((rows) => {
        if (live) setSolves({ key: puzzleKey, rows });
      })
      .catch(() => {
        if (live) setSolves({ key: puzzleKey, rows: {} });
      });
    return () => {
      live = false;
    };
  }, [active, puzzleKey]);

  return active && puzzleKey && solves?.key === puzzleKey ? solves.rows : EMPTY;
}

const EMPTY: Record<string, FriendSolve> = {};
