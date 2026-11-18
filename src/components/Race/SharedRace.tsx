import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useBestTimes } from "../../hooks/useSolveHistory";
import { useRaceName } from "../../hooks/useRaceName";
import type { RaceSolve } from "../../lib/friendRace";
import { loadViewerRace } from "../../lib/viewerRace";
import { decodeRaceReplay } from "../../lib/replayCode";
import { fetchReplayShare } from "../../lib/replayShare";
import { track } from "../../lib/analytics";
import type { Puzzle, PuzzleRef } from "../../types/puzzle";

// Loaded when a link asks for it: the page under the race does not carry it.
const FriendRaceDialog = lazy(() => import("./FriendRaceDialog").then((m) => ({ default: m.FriendRaceDialog })));

interface SharedRaceProps {
  puzzle: Puzzle;
  puzzleKey: string;
  /** The link's replay share ID (dailyChallenge.parseRaceLink). */
  shareId: string;
  /** The link's names for the clip's solvers, in its order; "Solver 1…" without them. */
  names?: readonly string[];
  /** Where the site links to this puzzle, for sharing the race on. */
  shareRef?: PuzzleRef | null;
  /** Start the puzzle: the clip's "Let me solve it", for a viewer who has not solved it. */
  onSolve?: () => void;
  onClose: () => void;
}

interface Shown {
  solves: RaceSolve[];
  letters: boolean;
  /** The link's clip, not the viewer's own race. */
  clip: boolean;
}

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

/**
 * A shared race link, opened (Andrew, 2026-11-17: the link went to the
 * puzzle, not the race). Someone whose friends have solved the puzzle gets
 * the race itself (FriendRaceDialog), as the menu's link would open it: for
 * the sender and their friends that is the race that was shared. Anyone else
 * gets the clip the link carries in the same dialog: colours and the link's
 * names, no letters, lanes counting squares won.
 * Renders nothing when the ID is not a race's (a solve's replay, or gone).
 */
export function SharedRace({ puzzle, puzzleKey, shareId, names, shareRef, onSolve, onClose }: SharedRaceProps) {
  const { t } = useTranslation();
  const ownName = useRaceName();
  const { user, loading } = useAuth();
  const best = useBestTimes()[puzzleKey];
  const [shown, setShown] = useState<Shown | null>(null);
  const userId = user?.id;

  useEffect(() => {
    if (loading) return;
    let alive = true;
    void (async () => {
      const code = await fetchReplayShare(shareId);
      const clip = code ? decodeRaceReplay(code) : null;
      if (!alive) return;
      if (!clip || clip.width !== puzzle.width || clip.height !== puzzle.height) {
        onClose();
        return;
      }
      const mine = userId ? await loadViewerRace(userId, puzzleKey, best, ownName).catch(() => null) : null;
      if (!alive) return;
      if (mine) {
        setShown({ solves: mine.solves, letters: mine.letters, clip: false });
      } else {
        // The clip as lanes: each solver's squares are the ones they were first to, on the clip's one clock.
        const named = names?.length === clip.colors.length;
        const seconds = Math.max(1, clip.seconds, Math.ceil(Math.max(...clip.claims.map((c) => c.ms)) / 1000));
        const solves = clip.colors.map((c, i): RaceSolve => ({
          id: `solver-${i}`,
          name: named ? (names as readonly string[])[i] : t("friendRace.sharedSolver", { n: i + 1 }),
          color: hex(c),
          seconds,
          events: clip.claims.filter((claim) => claim.player === i).map((claim) => [claim.ms, claim.cell, 1]),
        }));
        setShown({ solves, letters: false, clip: true });
      }
      track("shared_race_opened", { view: mine ? "race" : "clip", racers: mine ? mine.solves.length : clip.colors.length });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opened once per link and viewer; `best`, the names, `t` and `onClose` are read when it opens
  }, [loading, userId, shareId, puzzleKey, puzzle.width, puzzle.height]);

  if (!shown) return null;
  return (
    <Suspense fallback={null}>
      <FriendRaceDialog puzzle={puzzle} solves={shown.solves} letters={shown.letters} clip={shown.clip} shareRef={shareRef} cta={shown.clip && onSolve && typeof best !== "number" ? { label: t("challenge.solveYourself"), onClick: onSolve } : undefined} onClose={onClose} />
    </Suspense>
  );
}
