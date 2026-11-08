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
): SoloTimerApi {
  const key = useMemo(() => puzzle ? puzzleIdentity(puzzle) : null, [puzzle]);
  const explicitStart = useRef<string | null>(null);
  const clockRef = useRef<Clock | null>(null);
  const initRef = useRef(startOnLoad);
  initRef.current = startOnLoad;
  const assistedRef = useRef(assisted);
  assistedRef.current = assisted;
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

  useEffect(() => {
    if (!key) { clockRef.current = null; setRunning(false); setResult(null); return; }
    const progress = getProgress(key);
    const saved = loadSoloTimer();
    const previous = clockRef.current;
    const same = previous?.key === key;
    const completed = same ? previous.completed : !progress && saved?.key === key && saved.completed;
    // Preserve the initial explicit start through React StrictMode's effect replay.
    const start = same ? previous.anchor !== null || explicitStart.current === key : initRef.current(key);
    explicitStart.current = start ? key : null;
    const clock: Clock = {
      key, ms: same ? elapsed(previous) : progress?.elapsedMs ?? (saved?.key === key ? saved.elapsedMs : 0),
      anchor: !completed && start && document.visibilityState !== "hidden" ? Date.now() : null,
      completed: !!completed,
    };
    clockRef.current = clock;
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

  return { getElapsedSeconds, running, result, fresh, pause, resume, save, saveFailed };
}
