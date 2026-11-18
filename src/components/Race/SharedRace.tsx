import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../contexts/AuthContext";
import { useBestTimes } from "../../hooks/useSolveHistory";
import type { RaceSolve } from "../../lib/friendRace";
import { loadViewerRace } from "../../lib/viewerRace";
import { decodeRaceReplay } from "../../lib/replayCode";
import { fetchReplayShare } from "../../lib/replayShare";
import type { RoomReplay } from "../../lib/roomReplay";
import { track } from "../../lib/analytics";
import type { Puzzle, PuzzleRef } from "../../types/puzzle";

// Loaded when a link asks for them: the page under the race carries neither.
const FriendRaceDialog = lazy(() => import("./FriendRaceDialog").then((m) => ({ default: m.FriendRaceDialog })));
const RoomReplayDialog = lazy(() => import("./RoomReplayDialog").then((m) => ({ default: m.RoomReplayDialog })));

interface SharedRaceProps {
  puzzle: Puzzle;
  puzzleKey: string;
  /** The link's replay share ID (dailyChallenge.parseRaceLink). */
  shareId: string;
  /** Where the site links to this puzzle, for sharing the race on. */
  shareRef?: PuzzleRef | null;
  onClose: () => void;
}

type Shown =
  | { kind: "race"; solves: RaceSolve[]; letters: boolean }
  | { kind: "clip"; replay: RoomReplay; players: { userId: string; displayName: string; color: string }[]; colors: Record<string, string> };

const hex = ([r, g, b]: [number, number, number]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

/**
 * A shared race link, opened (Andrew, 2026-11-17: the link went to the
 * puzzle, not the race). Someone whose friends have solved the puzzle gets
 * the race itself (FriendRaceDialog), as the menu's link would open it: for
 * the sender and their friends that is the race that was shared, names and
 * all. Anyone else gets the clip the link carries, played over the puzzle's
 * page: colours only, no names and no letters, as it left the sender.
 * Renders nothing when the ID is not a race's (a solve's replay, or gone).
 */
export function SharedRace({ puzzle, puzzleKey, shareId, shareRef, onClose }: SharedRaceProps) {
  const { t } = useTranslation();
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
      const mine = userId ? await loadViewerRace(userId, puzzleKey, best, t("ghostRace.you")).catch(() => null) : null;
      if (!alive) return;
      if (mine) {
        setShown({ kind: "race", solves: mine.solves, letters: mine.letters });
      } else {
        const players = clip.colors.map((c, i) => ({ userId: `solver-${i}`, displayName: t("friendRace.sharedSolver", { n: i + 1 }), color: hex(c) }));
        const events = clip.claims.map((c) => ({ ms: c.ms, key: `${Math.floor(c.cell / clip.width)},${c.cell % clip.width}`, letter: "", playerId: `solver-${c.player}` }));
        const durationMs = Math.max(1000, clip.seconds * 1000, ...events.map((e) => e.ms));
        setShown({ kind: "clip", replay: { events, durationMs }, players, colors: Object.fromEntries(players.map((p) => [p.userId, p.color])) });
      }
      track("shared_race_opened", { view: mine ? "race" : "clip", racers: mine ? mine.solves.length : clip.colors.length });
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opened once per link and viewer; `best`, `t` and `onClose` are read when it opens
  }, [loading, userId, shareId, puzzleKey, puzzle.width, puzzle.height]);

  if (!shown) return null;
  return (
    <Suspense fallback={null}>
      {shown.kind === "race" ? (
        <FriendRaceDialog puzzle={puzzle} solves={shown.solves} letters={shown.letters} shareRef={shareRef} onClose={onClose} />
      ) : (
        <RoomReplayDialog puzzle={puzzle} replay={shown.replay} players={shown.players} playerColorMap={shown.colors} title={t("friendRace.title")} subtitle={t("friendRace.sharedSubtitle")} onClose={onClose} />
      )}
    </Suspense>
  );
}
