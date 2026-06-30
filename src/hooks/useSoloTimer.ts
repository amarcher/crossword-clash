import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle } from "../types/puzzle";
import {
  puzzleIdentity,
  loadSoloTimer,
  saveSoloTimer,
  recordSoloCompletion,
  describeRecordedCompletion,
  type SoloCompletionResult,
} from "../lib/soloStats";

/** How often the running elapsed time is checkpointed to localStorage. */
const PERSIST_INTERVAL_MS = 5_000;

export interface SoloTimerApi {
  /**
   * Reads the current elapsed time in whole seconds. Cheap and side-effect
   * free, so the display component can poll it once a second WITHOUT this hook
   * (and therefore the grid) re-rendering.
   */
  getElapsedSeconds: () => number;
  /** True while the clock is actively ticking. */
  running: boolean;
  /** Populated once the puzzle is completed; drives the completion modal. */
  result: SoloCompletionResult | null;
}

/**
 * Drives the solo elapsed timer and records personal-best / streak on finish.
 *
 * The time source is wall-clock based and resumes across reloads: accumulated
 * milliseconds live in localStorage and the live segment is `now - anchor`.
 * Crucially this hook never re-renders on each tick — the visible
 * `<SoloTimer>` owns its own per-second state and pulls from `getElapsedSeconds`.
 */
export function useSoloTimer(puzzle: Puzzle | null, isComplete: boolean): SoloTimerApi {
  const key = useMemo(() => (puzzle ? puzzleIdentity(puzzle) : null), [puzzle]);

  // Accumulated ms from earlier segments/reloads, plus the wall-clock anchor of
  // the segment currently running (null when paused/stopped).
  const baseMsRef = useRef(0);
  const anchorRef = useRef<number | null>(null);
  // Whether the active puzzle's completion has already been folded into stats —
  // prevents a reload of a finished puzzle from re-counting the streak.
  const recordedRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SoloCompletionResult | null>(null);

  const getElapsedSeconds = useCallback(() => {
    const live = anchorRef.current != null ? Date.now() - anchorRef.current : 0;
    return Math.floor((baseMsRef.current + live) / 1000);
  }, []);

  const persist = useCallback(
    (completed: boolean) => {
      if (!key) return;
      const live = anchorRef.current != null ? Date.now() - anchorRef.current : 0;
      saveSoloTimer({ key, elapsedMs: baseMsRef.current + live, completed });
    },
    [key],
  );

  // (Re)initialise when the puzzle identity changes: resume a saved run for the
  // same puzzle, or start a fresh clock.
  useEffect(() => {
    if (!key) {
      baseMsRef.current = 0;
      anchorRef.current = null;
      recordedRef.current = false;
      setRunning(false);
      setResult(null);
      return;
    }
    const saved = loadSoloTimer();
    const resume = saved && saved.key === key;
    baseMsRef.current = resume ? saved.elapsedMs : 0;
    recordedRef.current = resume ? saved.completed : false;
    setResult(null);

    if (recordedRef.current) {
      // Restored an already-finished puzzle: keep the clock frozen.
      anchorRef.current = null;
      setRunning(false);
    } else {
      anchorRef.current = Date.now();
      saveSoloTimer({ key, elapsedMs: baseMsRef.current, completed: false });
      setRunning(true);
    }
  }, [key]);

  // Handle completion: freeze the clock and record best time + streak (once).
  useEffect(() => {
    if (!key || !isComplete) return;

    // Freeze the running segment into the accumulated base.
    if (anchorRef.current != null) {
      baseMsRef.current += Date.now() - anchorRef.current;
      anchorRef.current = null;
    }
    setRunning(false);

    const finishSeconds = Math.floor(baseMsRef.current / 1000);

    if (recordedRef.current) {
      // Reload of a finished puzzle — surface stored result, do not re-record.
      setResult(describeRecordedCompletion(key, finishSeconds));
      return;
    }
    recordedRef.current = true;
    saveSoloTimer({ key, elapsedMs: baseMsRef.current, completed: true });
    setResult(recordSoloCompletion(key, finishSeconds));
  }, [key, isComplete]);

  // Checkpoint the running clock so a reload resumes accurately.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => persist(false), PERSIST_INTERVAL_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") persist(false);
    };
    const onPageHide = () => persist(false);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      persist(false);
    };
  }, [running, persist]);

  return { getElapsedSeconds, running, result };
}
