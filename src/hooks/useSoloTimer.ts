import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle } from "../types/puzzle";
import { puzzleIdentity, loadSoloTimer, saveSoloTimer, recordSoloCompletion, describeRecordedCompletion, type SoloCompletionResult } from "../lib/soloStats";
import { clearProgress, getProgress, saveAttempt } from "../lib/soloProgress";

const PERSIST_INTERVAL_MS = 5_000;
export interface SoloTimerApi {
  getElapsedSeconds: () => number;
  running: boolean;
  result: SoloCompletionResult | null;
  fresh: boolean;
  saveFailed: boolean;
  pause: () => boolean;
  resume: () => void;
  save: () => boolean;
  /** A new attempt at the puzzle on screen: the clock back to zero and running, the finish forgotten. */
  restart: () => void;
}
interface Clock {
  key: string;
  ms: number;
  anchor: number | null;
  completed: boolean;
}
const elapsed = (clock: Clock) => clock.ms + (clock.anchor === null ? 0 : Math.max(0, Date.now() - clock.anchor));
function checkpoint(clock: Clock): boolean {
  const ms = elapsed(clock);
  const progress = getProgress(clock.key);
  if (!clock.completed && progress && saveAttempt({ ...progress, elapsedMs: ms, updatedAt: Date.now() }) !== "saved") return false;
  return saveSoloTimer({ key: clock.key, elapsedMs: ms, completed: clock.completed });
}
function stop(clock: Clock): boolean {
  clock.ms = elapsed(clock);
  clock.anchor = null;
  return checkpoint(clock);
}

/** Each segment belongs to its puzzle, even when React cleans it up after a switch. */
export function useSoloTimer(
  puzzle: Puzzle | null,
  isComplete: boolean,
  assisted = false,
  startOnLoad: (key: string) => boolean = () => true,
  /**
   * The puzzle was opened already solved (GameContext.reopenedSolved): the
   * clock is its recorded time and the finish is not a new one. Passed in,
   * not read from the single stored timer record, because a puzzle switched
   * to inside the mounted screen has that record rewritten by the previous
   * puzzle's cleanup just before this one's clock is built.
   */
  solved: { key: string; seconds: number } | null = null,
): SoloTimerApi {
  const key = useMemo(() => puzzle ? puzzleIdentity(puzzle) : null, [puzzle]);
  const explicitStart = useRef<string | null>(null);
  const clockRef = useRef<Clock | null>(null);
  const initRef = useRef(startOnLoad);
  initRef.current = startOnLoad;
  const assistedRef = useRef(assisted);
  assistedRef.current = assisted;
  const solvedRef = useRef(solved);
  solvedRef.current = solved;
  const [saveFailed, setSaveFailed] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SoloCompletionResult | null>(null);
  const [fresh, setFresh] = useState(false);
  const getElapsedSeconds = useCallback(() => clockRef.current ? Math.floor(elapsed(clockRef.current) / 1000) : 0, []);
  const save = useCallback(() => {
    const saved = !clockRef.current || checkpoint(clockRef.current);
    setSaveFailed(!saved);
    return saved;
  }, []);
  const pause = useCallback(() => {
    const saved = !clockRef.current || stop(clockRef.current);
    setRunning(false);
    setSaveFailed(!saved);
    return saved;
  }, []);
  const resume = useCallback(() => {
    const clock = clockRef.current;
    if (!clock || clock.completed || clock.anchor !== null || document.visibilityState === "hidden") return;
    clock.anchor = Date.now();
    setRunning(true);
  }, []);

  const restart = useCallback(() => {
    const clock = clockRef.current;
    if (!clock) return;
    clock.ms = 0;
    clock.completed = false;
    clock.anchor = document.visibilityState === "hidden" ? null : Date.now();
    explicitStart.current = clock.anchor === null ? null : clock.key;
    setResult(null);
    setFresh(false);
    setRunning(clock.anchor !== null);
    setSaveFailed(!checkpoint(clock));
  }, []);

  useEffect(() => {
    if (!key) { clockRef.current = null; setRunning(false); setResult(null); return; }
    const progress = getProgress(key);
    const saved = loadSoloTimer();
    const previous = clockRef.current;
    const same = previous?.key === key;
    const reopened = !same && solvedRef.current?.key === key ? solvedRef.current : null;
    const completed = same ? previous.completed : !!reopened || (!progress && saved?.key === key && saved.completed);
    // Preserve the initial explicit start through React StrictMode's effect replay.
    const start = same ? previous.anchor !== null || explicitStart.current === key : initRef.current(key);
    explicitStart.current = start ? key : null;
    const clock: Clock = {
      key, ms: same ? elapsed(previous) : reopened ? reopened.seconds * 1000 : progress?.elapsedMs ?? (saved?.key === key ? saved.elapsedMs : 0),
      anchor: !completed && start && document.visibilityState !== "hidden" ? Date.now() : null,
      completed: !!completed,
    };
    clockRef.current = clock;
    // The stored record follows the solved puzzle, so a reload restores it as finished.
    if (reopened) checkpoint(clock);
    setRunning(clock.anchor !== null);
    setResult(null);
    setFresh(false);
    setSaveFailed(false);
    const hide = () => { if (document.visibilityState === "hidden") { explicitStart.current = null; pause(); } };
    const pagehide = () => { explicitStart.current = null; pause(); };
    const interval = window.setInterval(() => { if (clock.anchor !== null) setSaveFailed(!checkpoint(clock)); }, PERSIST_INTERVAL_MS);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pagehide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", pagehide);
      stop(clock);
    };
  }, [key, pause]);

  useEffect(() => {
    const clock = clockRef.current;
    if (!key || !isComplete || !clock || clock.key !== key) return;
    const wasCompleted = clock.completed;
    clock.ms = elapsed(clock);
    clock.anchor = null;
    clock.completed = true;
    setRunning(false);
    checkpoint(clock);
    clearProgress(key);
    const seconds = Math.floor(clock.ms / 1000);
    setFresh(!wasCompleted);
    setResult(wasCompleted ? describeRecordedCompletion(key, seconds) : recordSoloCompletion(key, seconds, new Date(), { assisted: assistedRef.current }));
  }, [key, isComplete]);

  return { getElapsedSeconds, running, result, fresh, pause, resume, save, saveFailed, restart };
}
