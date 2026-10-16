import { useEffect, useMemo, useRef } from "react";
import { PlaySessionTracker, type PlayMode, type PlaySource } from "../lib/playInsights";
import { platformLabel, playClient, playInsightsAllowed, sendPlaySession, watchPlayInsightsAuth } from "../lib/playInsightsClient";
import { puzzleIdentity } from "../lib/soloStats";
import type { CellState, Direction, Puzzle, PuzzleClue } from "../types/puzzle";

interface PlayInsightsInput {
  puzzle: Puzzle | null;
  playerCells: Record<string, CellState>;
  direction: Direction;
  activeClue: PuzzleClue | null | undefined;
  /** Running count of wrong letters; each increase is recorded. */
  wrongLetters: number;
  isComplete: boolean;
  mode: PlayMode;
  source: PlaySource;
  /** Whose letters count as "mine" in multiplayer; undefined in solo. */
  localPlayerId?: string | null;
  /** False while not actually playing (lobby, waiting for the host). */
  active?: boolean;
  /** Playing as an account (not the anonymous default); recorded as signed_in. */
  signedIn?: boolean;
}

/**
 * Records how this visit to a puzzle went (see lib/playInsights) and sends it
 * when the puzzle is finished, the page is hidden or closed, or the player
 * leaves the screen. Only visits with real input are sent.
 */
export function usePlayInsights({ puzzle, playerCells, direction, activeClue, wrongLetters, isComplete, mode, source, localPlayerId, active = true, signedIn = false }: PlayInsightsInput) {
  const tracker = useRef<PlaySessionTracker | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const latest = useRef({ playerCells, direction, activeClue, isComplete });
  latest.current = { playerCells, direction, activeClue, isComplete };
  // Reopening a finished puzzle isn't a new completion.
  const startedComplete = useRef(false);
  const key = useMemo(() => (puzzle ? puzzleIdentity(puzzle) : null), [puzzle]);
  const enabled = !!puzzle && active && playInsightsAllowed();

  const flush = () => {
    const t = tracker.current;
    if (t?.hasActivity) sendPlaySession({ ...t.record(Date.now()), source: sourceRef.current, signed_in: signedInRef.current });
  };

  // A new visit per puzzle (and per return to the play screen).
  useEffect(() => {
    if (!enabled || !puzzle || !key) return;
    watchPlayInsightsAuth();
    startedComplete.current = latest.current.isComplete;
    tracker.current = new PlaySessionTracker(puzzle, latest.current.playerCells, { puzzleKey: key, source: sourceRef.current, mode, client: playClient(), platform: platformLabel(), signedIn: signedInRef.current }, Date.now());
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
      tracker.current = null;
    };
    // puzzle is identified by key; flush reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, mode]);

  useEffect(() => {
    tracker.current?.selectClue(activeClue ?? null, Date.now());
  }, [activeClue]);

  // A count, not the flashing cell: two wrong letters inside one flash (or one
  // render) would otherwise look like a single change.
  const seenWrong = useRef(wrongLetters);
  useEffect(() => {
    const now = Date.now();
    for (let i = seenWrong.current; i < wrongLetters; i++) tracker.current?.wrongLetter(latest.current.activeClue ?? null, now);
    seenWrong.current = wrongLetters;
  }, [wrongLetters]);

  useEffect(() => {
    tracker.current?.cellsChanged(playerCells, latest.current.direction, localPlayerId ?? null, Date.now());
  }, [playerCells, localPlayerId]);

  useEffect(() => {
    if (!isComplete || !tracker.current || startedComplete.current) return;
    tracker.current.complete(Date.now());
    flush();
  }, [isComplete]);
}
