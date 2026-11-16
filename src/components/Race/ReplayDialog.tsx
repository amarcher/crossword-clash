import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pause, Play, RotateCcw, X } from "lucide-react";
import { CrosswordGrid } from "../CrosswordGrid";
import { Button } from "../ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import { ghostAt, replaySpeed, WRONG_LETTER, type TraceEvent } from "../../lib/race";
import type { CellState, Puzzle } from "../../types/puzzle";

/** One solve to play back: who, in which colour, how long it took, and its letters. */
export interface ReplaySolve {
  name: string;
  color: string;
  seconds: number;
  events: TraceEvent[];
}

interface ReplayDialogProps {
  puzzle: Puzzle;
  /** One solve, or two played on one board and one clock: a race, watched by either side. */
  solves: ReplaySolve[];
  onClose: () => void;
}

const NO_HIGHLIGHT = new Set<string>();

/**
 * Where a solve is `ms` into the replay. Its time is in whole seconds and its
 * last letter went in a fraction of a second after that, so once its clock
 * has stopped the solve is shown whole: the replay used to end one square
 * short of a finished grid (Andrew, 2026-11-16).
 */
const solveAt = (solve: ReplaySolve, ms: number) => ghostAt(solve, ms >= solve.seconds * 1000 ? Infinity : ms);

/** The letters a solve shows `ms` into it, in the solve's colour (a wrong one rebuilt from a share code as checked-wrong). */
function cellsAt(solve: ReplaySolve, ms: number, width: number): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const [cell, letter] of solveAt(solve, ms).filled) {
    if (typeof letter !== "string") continue;
    out[`${Math.floor(cell / width)},${cell % width}`] = letter === WRONG_LETTER ? { letter, correct: false, checked: "wrong" } : { letter, correct: true, playerId: "replay" };
  }
  return out;
}

/** The squares a solve has filled `ms` into it, as the grid's dot map (cell key → colour). */
function dotsAt(solve: ReplaySolve, ms: number, width: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const cell of solveAt(solve, ms).filled.keys()) out.set(`${Math.floor(cell / width)},${cell % width}`, solve.color);
  return out;
}

/**
 * Solves played back, sped up (race.ts). One solve shows its letters. A race
 * is two solves on ONE board and one clock (Andrew, 2026-11-16: two boards do
 * not fit a phone and cannot be watched at once): the first solve's letters
 * fill in, shaded in its colour, and the second's squares show as the dot a
 * live race draws, each stopping at its finish, the winner marked. Letters
 * only ever come from a recording the server gave with letters (the viewer
 * has finished the puzzle); one without them plays as dots, so nothing is
 * given away.
 */
export function ReplayDialog({ puzzle, solves, onClose }: ReplayDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  const longest = Math.max(1, ...solves.map((s) => s.seconds));
  const speed = replaySpeed(longest);
  const endMs = longest * 1000;
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const started = useRef<{ wall: number; from: number } | null>(null);

  useEffect(() => {
    if (!playing) {
      started.current = null;
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      if (!started.current) started.current = { wall: now, from: ms >= endMs ? 0 : ms };
      const next = Math.min(endMs, started.current.from + (now - started.current.wall) * speed);
      setMs(next);
      if (next >= endMs) setPlaying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `ms` is the starting point when play begins, not a trigger
  }, [playing, endMs, speed]);

  const race = solves.length > 1;
  const [a, b] = solves;
  const letters = useMemo(() => cellsAt(a, ms, puzzle.width), [a, ms, puzzle.width]);
  // A lone recording without letters (the viewer has not solved the puzzle) plays as dots too.
  const dotted = b ?? (a.events.some((e) => typeof e[2] !== "string") ? a : null);
  const dots = useMemo(() => (dotted ? dotsAt(dotted, ms, puzzle.width) : undefined), [dotted, ms, puzzle.width]);
  const fastest = race ? Math.min(...solves.map((s) => s.seconds)) : null;
  const winners = race ? solves.filter((s) => s.seconds === fastest) : [];
  const title = race ? t("ghostRace.raceTitle", { a: a.name, b: b.name }) : t("ghostRace.replayTitle", { name: a.name });
  const subtitle = race
    ? winners.length > 1
      ? t("ghostRace.raceTied", { speed })
      : t("ghostRace.raceWon", { name: winners[0].name, delta: formatDuration(Math.abs(a.seconds - b.seconds)), speed })
    : t("ghostRace.replaySubtitle", { time: formatDuration(a.seconds), speed });

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center" style={{ padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))" }}>
      <div className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="lf-pop-in relative max-h-full w-fit max-w-full overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-overlay">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">{title}</h2>
            <p className="text-sm text-muted text-balance">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("ghostRace.close")} className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        {race && (
          <ul className="mt-4 grid grid-cols-2 gap-x-4 text-xs">
            {solves.map((s, i) => {
              const done = ms >= s.seconds * 1000;
              const won = done && s.seconds === fastest;
              return (
                <li key={`${s.name}-${i}`} data-testid="replay-racer" className="flex min-w-0 items-center gap-1.5">
                  {/* The key to the board: a shaded square for the solve whose letters show, a dot for the other. */}
                  {i === 0 ? (
                    <span className="size-3 shrink-0 rounded-[3px] ring-1 ring-inset ring-ink/20" style={{ backgroundColor: `color-mix(in srgb, ${s.color} 18%, white)` }} aria-hidden="true" />
                  ) : (
                    <span className="mx-[3px] size-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{s.name}</span>
                  <span className={`inline-flex items-center gap-0.5 font-mono tabular-nums ${won ? "font-bold text-emerald-700" : "text-muted"}`}>
                    {won && <Check className="size-3.5" aria-hidden="true" />}
                    {formatDuration(Math.floor(Math.min(ms, s.seconds * 1000) / 1000))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {/* The grid sizes itself from the viewport, as in the room's replay: as big as the width or the height leaves, capped, and the panel wraps it. */}
        <div className={race ? "mt-2" : "mt-4"} style={{ "--native-grid-size": "min(calc(100vw - 4.5rem), calc(100svh - 17rem), 30rem)" } as React.CSSProperties}>
          <CrosswordGrid puzzle={puzzle} playerCells={letters} selectedCell={null} highlightedCells={NO_HIGHLIGHT} onCellClick={() => undefined} interactive={false} playerColorMap={{ replay: a.color }} ghostTints={dots} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => (ms >= endMs ? (setMs(0), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? <Pause className="size-4" aria-hidden="true" /> : ms >= endMs ? <RotateCcw className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {playing ? t("ghostRace.replayPause") : ms >= endMs ? t("ghostRace.replayAgain") : t("ghostRace.replayPlay")}
          </Button>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(ms / endMs) * 100}%` }} />
          </span>
          <span className="font-mono text-xs tabular-nums text-muted">{formatDuration(Math.floor(ms / 1000))}</span>
        </div>
      </div>
    </div>
  );
}
