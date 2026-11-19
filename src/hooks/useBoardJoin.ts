import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useMaybeAccount } from "../contexts/AccountContext";
import { prepareDailyResult, type PendingDailyResult } from "../lib/dailyLeaderboard";
import { setRaceVisibility } from "../lib/race";
import { track } from "../lib/analytics";

/**
 * What stands between a finish and the board, for the finish screen and the
 * board to offer: an account (a player without one is never posted), or a
 * choice of who may watch (an account that hides its solves from everyone).
 */
export type BoardJoin =
  | { kind: "account"; onCreate: () => void }
  | { kind: "visibility"; busy: boolean; failed: boolean; onChoose: (who: "everyone" | "friends") => void };

/**
 * The join prompt for a parked finish, and the post that follows it: once the
 * player has an account with a username, or has chosen who may watch, the
 * finish is prepared again and goes to the board.
 */
export function useBoardJoin(pending: PendingDailyResult | null | undefined): BoardJoin | null {
  const { user } = useAuth();
  const account = useMaybeAccount();
  const { setPendingDailyResult } = useGame();
  const username = account?.profile?.username;
  const isAccount = !!user && !user.is_anonymous;

  const repost = useCallback(
    (from: PendingDailyResult, firstOnly = false) => {
      if (!user || user.is_anonymous) return;
      const entry = { ...from.entry, userId: user.id, displayName: username ?? from.entry.displayName };
      const next: PendingDailyResult = { ...from, entry, posted: false, postingHold: "checking", settled: Promise.resolve() };
      next.settled = prepareDailyResult(from.day, from.slot, entry, user, from.gameId, firstOnly).then((result) => {
        setPendingDailyResult((current) => (current === next ? result : current));
        return result.settled;
      });
      setPendingDailyResult(next);
    },
    [user, username, setPendingDailyResult],
  );

  // Parked with no hold is a finish made without an account: it posts as soon as there is one.
  const reposted = useRef<PendingDailyResult | null>(null);
  useEffect(() => {
    if (!pending || pending.posted || pending.postingHold || !isAccount || !username || reposted.current === pending) return;
    reposted.current = pending;
    // The account may have solved this already, elsewhere: that time stands, this later one never replaces it.
    repost(pending, true);
  }, [pending, isAccount, username, repost]);

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const openAccount = account?.openAccount;
  const onCreate = useCallback(() => {
    track("board_join", { step: "account" });
    openAccount?.({ placement: "board-join" });
  }, [openAccount]);
  const onChoose = useCallback(
    (who: "everyone" | "friends") => {
      if (!user || !pending || busy) return;
      setBusy(true);
      setFailed(false);
      track("board_join", { step: "visibility", who });
      setRaceVisibility(user.id, who).then(
        () => {
          setBusy(false);
          repost(pending);
        },
        () => {
          setBusy(false);
          setFailed(true);
        },
      );
    },
    [user, pending, busy, repost],
  );

  if (!pending || pending.posted || !user) return null;
  if (user.is_anonymous) return account?.available ? { kind: "account", onCreate } : null;
  if (pending.postingHold === "disabled") return { kind: "visibility", busy, failed, onChoose };
  return null;
}
