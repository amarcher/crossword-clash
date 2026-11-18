import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Puzzle } from "../types/puzzle";
import { puzzleIdentity, loadSoloTimer, saveSoloTimer, recordSoloCompletion, describeRecordedCompletion, type SoloCompletionResult } from "../lib/soloStats";
import { clearProgress, getProgress, saveAttempt } from "../lib/soloProgress";
import { IDLE_GAP_SECONDS } from "../lib/playInsights";

const PERSIST_INTERVAL_MS = 5_000;
/**
 * A running clock never holds more than this past the solver's last input, and
 * pauses there (Andrew, 2026-11-13: a puzzle left open on a desk, or a laptop
 * closed on it, kept counting, and finishing it filed that time on the board
 * and in the history). Nothing is refunded: the clock keeps the idle minute, so
 * looking at a ranked grid is never free. The cap is in the clock's arithmetic,
 * not only in a timer, because a sleeping computer fires no timer and no
 * visibility event: whatever reads the clock next reads the capped time.
 */
export const IDLE_PAUSE_MS = IDLE_GAP_SECONDS * 1000;
const IDLE_CHECK_MS = 1_000;
/** What counts as the solver being there: a key, a tap or click, a scroll. Not a mouse merely moving. */
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "touchstart", "wheel", "scroll"] as const;
export interface SoloTimerApi {
  getElapsedSeconds: () => number;
  /** The same clock to the millisecond: a race recording's timestamps (race.ts). */
  getElapsedMs: () => number;
  running: boolean;
  /** The clock paused itself after a minute without input; false again once resumed. */
  idlePaused: boolean;
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
  /** When the solver last did something (or the clock last started). */
  active: number;
  completed: boolean;
}
const elapsed = (clock: Clock) => clock.ms + (clock.anchor === null ? 0 : Math.max(0, Math.min(Date.now(), clock.active + IDLE_PAUSE_MS) - clock.anchor));
const idle = (clock: Clock) => clock.anchor !== null && Date.now() - clock.active >= IDLE_PAUSE_MS;
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
  const [idlePaused, setIdlePaused] = useState(false);
  const [result, setResult] = useState<SoloCompletionResult | null>(null);
  const [fresh, setFresh] = useState(false);
  const getElapsedSeconds = useCallback(() => clockRef.current ? Math.floor(elapsed(clockRef.current) / 1000) : 0, []);
  const getElapsedMs = useCallback(() => (clockRef.current ? elapsed(clockRef.current) : 0), []);
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
    clock.anchor = clock.active = Date.now();
    setIdlePaused(false);
    setRunning(true);
  }, []);

  const restart = useCallback(() => {
    const clock = clockRef.current;
    if (!clock) return;
    clock.ms = 0;
    clock.completed = false;
    clock.active = Date.now();
    clock.anchor = document.visibilityState === "hidden" ? null : clock.active;
    setIdlePaused(false);
    explicitStart.current = clock.anchor === null ? null : clock.key;
    setResult(null);
    setFresh(false);
    setRunning(clock.anchor !== null);
    setSaveFailed(!checkpoint(clock));
  }, []);

  useEffect(() => {
    if (!key) { clockRef.current = null; setRunning(false); setIdlePaused(false); setResult(null); return; }
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
      active: same ? previous.active : Date.now(),
      completed: !!completed,
    };
    clockRef.current = clock;
    // The stored record follows the solved puzzle, so a reload restores it as finished.
    if (reopened) checkpoint(clock);
    setRunning(clock.anchor !== null);
    setResult(null);
    setFresh(false);
    setSaveFailed(false);
    if (!same) setIdlePaused(false);
    const idlePause = () => { explicitStart.current = null; pause(); setIdlePaused(true); };
    // Input that arrives once the minute is up (a key on waking the computer) pauses; it never restarts the count.
    const activity = () => { if (idle(clock)) idlePause(); else if (clock.anchor !== null) clock.active = Date.now(); };
    const idleCheck = window.setInterval(() => { if (idle(clock)) idlePause(); }, IDLE_CHECK_MS);
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, activity, { capture: true, passive: true });
    const hide = () => { if (document.visibilityState === "hidden") { explicitStart.current = null; pause(); } };
    const pagehide = () => { explicitStart.current = null; pause(); };
    const interval = window.setInterval(() => { if (clock.anchor !== null) setSaveFailed(!checkpoint(clock)); }, PERSIST_INTERVAL_MS);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", pagehide);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(idleCheck);
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, activity, { capture: true });
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

  return { getElapsedSeconds, getElapsedMs, running, idlePaused, result, fresh, pause, resume, save, saveFailed, restart };
}
