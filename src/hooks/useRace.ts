import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CellState } from "../types/puzzle";
import { useFriends } from "../contexts/FriendsContext";
import {
  diffCells,
  fetchRaceCandidates,
  ghostAt,
  ghostTints,
  hasLetters,
  loadTrace,
  MAX_EVENTS,
  saveTrace,
  type Ghost,
  type GhostFrame,
  type RaceCandidate,
  type StoredTrace,
} from "../lib/race";

/**
 * Records the solo solve on screen as race events (race.ts): every change to
 * a square's letter, stamped with the solve clock. The recording lives in
 * localStorage with the puzzle's identity, so a refresh mid-solve continues
 * it; one that begins with letters already in the grid (progress from before
 * it existed, another device) is marked partial and never uploaded.
 */
export function useSolveRecorder({
  puzzleKey,
  width,
  playerCells,
  getElapsedMs,
  enabled,
}: {
  puzzleKey: string | null;
  width: number;
  playerCells: Record<string, CellState>;
  getElapsedMs: () => number;
  /** Off while the grid shows a solved puzzle reopened for a look. */
  enabled: boolean;
}) {
  const trace = useRef<StoredTrace | null>(null);
  const prev = useRef<Record<string, CellState>>(playerCells);
  const latest = useRef(playerCells);
  latest.current = playerCells;

  // A new puzzle: pick up its stored recording, or start one from the grid as it arrives.
  useEffect(() => {
    prev.current = latest.current;
    if (!puzzleKey) {
      trace.current = null;
      return;
    }
    const stored = loadTrace(puzzleKey);
    trace.current =
      stored && matchesGrid(stored, latest.current, width)
        ? stored
        : { key: puzzleKey, events: [], partial: hasLetters(latest.current) };
  }, [puzzleKey, width]);

  useEffect(() => {
    const before = prev.current;
    prev.current = playerCells;
    const current = trace.current;
    if (!enabled || !current || current.key !== puzzleKey) return;
    const events = diffCells(before, playerCells, width, getElapsedMs());
    if (events.length === 0) return;
    // A keystroke or a reveal changes one square. Several at once is the grid
    // being loaded (saved progress restored): keep recording only if it is the
    // state the recording already describes.
    if (events.length > 2) {
      if (!matchesGrid(current, playerCells, width)) current.partial = true;
    } else {
      current.events = [...current.events, ...events];
      if (current.events.length > MAX_EVENTS) current.partial = true;
    }
    saveTrace(current);
  }, [playerCells, enabled, puzzleKey, width, getElapsedMs]);

  /** "Clear and solve again": a fresh recording. */
  const reset = useCallback(() => {
    if (!puzzleKey) return;
    trace.current = { key: puzzleKey, events: [], partial: false };
    saveTrace(trace.current);
  }, [puzzleKey]);

  /** The finished recording, or null when it can't be raced. */
  const take = useCallback((): StoredTrace | null => {
    const current = trace.current;
    return current && current.key === puzzleKey && !current.partial && current.events.length ? current : null;
  }, [puzzleKey]);

  return { reset, take };
}

/** Whether replaying a recording to its end gives exactly the letters in the grid. */
function matchesGrid(trace: StoredTrace, cells: Record<string, CellState>, width: number): boolean {
  const end = ghostAt({ events: trace.events, seconds: Infinity }, Infinity).filled;
  const letters = Object.entries(cells).filter(([, c]) => !!c.letter);
  if (letters.length !== end.size) return false;
  return letters.every(([key, c]) => {
    const [row, col] = key.split(",").map(Number);
    return end.get(row * width + col) === c.letter;
  });
}

/** How often the ghosts advance while the racer's clock runs. */
const GHOST_TICK_MS = 250;

/**
 * The ghosts at the racer's clock: a frame per ghost (what it has filled,
 * whether it has finished) and the grid tint, recomputed every quarter
 * second while the clock runs and once whenever it stops.
 */
export function useGhosts(ghosts: readonly Ghost[], getElapsedMs: () => number, running: boolean, width: number) {
  const [ms, setMs] = useState(() => getElapsedMs());
  useEffect(() => {
    setMs(getElapsedMs());
    if (!running || ghosts.length === 0) return;
    const id = window.setInterval(() => setMs(getElapsedMs()), GHOST_TICK_MS);
    return () => window.clearInterval(id);
  }, [running, ghosts, getElapsedMs]);
  const frames = useMemo<GhostFrame[]>(() => ghosts.map((g) => ghostAt(g, ms)), [ghosts, ms]);
  const tints = useMemo(() => ghostTints(ghosts, frames, width), [ghosts, frames, width]);
  return { ms, frames, tints };
}

/**
 * The friends who have a raceable recording of this puzzle (race.ts), asked
 * once per puzzle while the viewer is an account with a username. Empty
 * otherwise and when the read fails: the Race button is an offer, never a gate.
 */
export function useRaceCandidates(puzzleKey: string | null, enabled: boolean): RaceCandidate[] {
  const { active } = useFriends();
  const [state, setState] = useState<{ key: string; rows: RaceCandidate[] } | null>(null);
  useEffect(() => {
    if (!active || !enabled || !puzzleKey) return;
    let live = true;
    fetchRaceCandidates(puzzleKey)
      .then((rows) => live && setState({ key: puzzleKey, rows }))
      .catch(() => live && setState({ key: puzzleKey, rows: [] }));
    return () => {
      live = false;
    };
  }, [active, enabled, puzzleKey]);
  return active && enabled && puzzleKey && state?.key === puzzleKey ? state.rows : EMPTY;
}

const EMPTY: RaceCandidate[] = [];
