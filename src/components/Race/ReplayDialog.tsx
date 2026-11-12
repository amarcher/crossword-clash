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
  /** One solve, or two played side by side on one clock: a race, watched by either side. */
  solves: ReplaySolve[];
  onClose: () => void;
}

const NO_HIGHLIGHT = new Set<string>();

/** The letters a solve shows `ms` into it, in the solve's colour (a wrong one rebuilt from a share code as checked-wrong). */
function cellsAt(solve: ReplaySolve, ms: number, width: number): Record<string, CellState> {
  const out: Record<string, CellState> = {};
  for (const [cell, letter] of ghostAt(solve, ms).filled) {
    if (typeof letter !== "string") continue;
    out[`${Math.floor(cell / width)},${cell % width}`] = letter === WRONG_LETTER ? { letter, correct: false, checked: "wrong" } : { letter, correct: true, playerId: "replay" };
  }
  return out;
}

/**
 * Solves played back with their letters, sped up (race.ts). One solve, or a
 * race: both side by side on one clock, each stopping at its finish, the
 * winner marked. Offered once the viewer has finished the puzzle, so nothing
 * is given away.
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

  const grids = useMemo(() => solves.map((s) => cellsAt(s, ms, puzzle.width)), [solves, ms, puzzle.width]);
  const race = solves.length > 1;
  const [a, b] = solves;
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
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`lf-pop-in relative max-h-full w-full overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-overlay ${race ? "max-w-3xl" : "max-w-md"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">{title}</h2>
            <p className="text-sm text-muted">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("ghostRace.close")} className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className={`mt-4 grid gap-3 ${race ? "grid-cols-2" : ""}`}>
          {solves.map((s, i) => {
            const done = ms >= s.seconds * 1000;
            const won = race && done && s.seconds === fastest;
            return (
              <figure key={`${s.name}-${i}`} className="min-w-0" aria-label={s.name}>
                {race && (
                  <figcaption className="mb-1.5 flex items-center gap-1.5 text-xs">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{s.name}</span>
                    <span className={`inline-flex items-center gap-0.5 font-mono tabular-nums ${won ? "font-bold text-emerald-700" : "text-muted"}`}>
                      {won && <Check className="size-3.5" aria-hidden="true" />}
                      {formatDuration(Math.floor(Math.min(ms, s.seconds * 1000) / 1000))}
                    </span>
                  </figcaption>
                )}
                <CrosswordGrid puzzle={puzzle} playerCells={grids[i]} selectedCell={null} highlightedCells={NO_HIGHLIGHT} onCellClick={() => undefined} interactive={false} playerColorMap={{ replay: s.color }} />
              </figure>
            );
          })}
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
