import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Loader2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useRaceCandidates } from "../../hooks/useRace";
import { fetchOwnSolveTrace, loadTrace } from "../../lib/race";
import { fetchFriendRace, raceSolves, type RaceSolve } from "../../lib/friendRace";
import { track } from "../../lib/analytics";
import type { Puzzle, PuzzleRef } from "../../types/puzzle";

// Loaded on the first tap: the menu carries the link, not the race.
const FriendRaceDialog = lazy(() => import("./FriendRaceDialog").then((m) => ({ default: m.FriendRaceDialog })));

interface FriendRaceLinkProps {
  puzzle: Puzzle;
  puzzleKey: string;
  /** The viewer's finish time, for a recording only this device holds. */
  seconds?: number;
  /** Where the site links to this puzzle (today's daily carries none itself). */
  shareRef?: PuzzleRef | null;
  /** Where this is shown, for analytics. */
  placement: string;
  className?: string;
}

/**
 * "Watch your race with N friends" for a solved puzzle (friendRace.ts): a
 * quiet link that renders nothing until a friend has a recorded solve of the
 * puzzle, and opens the race over the page it is on.
 */
export function FriendRaceLink({ puzzle, puzzleKey, seconds, shareRef, placement, className = "" }: FriendRaceLinkProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const candidates = useRaceCandidates(puzzleKey, true);
  const friends = useMemo(() => candidates.filter((c) => c.friend), [candidates]);
  const [race, setRace] = useState<{ solves: RaceSolve[]; letters: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback(async () => {
    if (loading || !user) return;
    setLoading(true);
    try {
      const kept = loadTrace(puzzleKey);
      const [found, mine] = await Promise.all([fetchFriendRace(puzzleKey), fetchOwnSolveTrace(user.id, puzzleKey).catch(() => null)]);
      if (found.friends.length === 0) return;
      // The account's kept recording, or this device's when the solve was never filed.
      const own = mine && mine.events.length > 0 ? mine : typeof seconds === "number" && kept && !kept.partial && kept.events.length > 0 ? { seconds, events: kept.events } : null;
      const solves = raceSolves(found, own ? { id: user.id, name: t("ghostRace.you"), ...own } : null);
      setRace({ solves, letters: found.withLetters });
      track("friend_race_opened", { placement, racers: solves.length, own: !!own });
    } catch (err) {
      console.warn("The race:", err);
    } finally {
      setLoading(false);
    }
  }, [loading, user, puzzleKey, seconds, placement, t]);

  if (friends.length === 0 || !user) return null;
  return (
    <>
      <button
        type="button"
        data-testid="friend-race-link"
        onClick={() => void open()}
        disabled={loading}
        className={`inline-flex min-h-11 items-center gap-1.5 max-w-full rounded-lg text-left text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500 ${className}`}
      >
        {loading ? <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Flag className="size-4 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 truncate">{t("friendRace.short", { count: friends.length, name: friends[0].username })}</span>
      </button>
      {race && (
        <Suspense fallback={null}>
          <FriendRaceDialog puzzle={puzzle} solves={race.solves} letters={race.letters} shareRef={shareRef} onClose={() => setRace(null)} />
        </Suspense>
      )}
    </>
  );
}
