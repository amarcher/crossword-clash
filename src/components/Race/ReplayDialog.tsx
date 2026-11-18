import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { CrosswordGrid } from "../CrosswordGrid";
import { Button } from "../ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import { replaySpeed, type TraceEvent } from "../../lib/race";
import { cellsAt, dotsAt } from "../../lib/replayCells";
import type { RaceSolve } from "../../lib/friendRace";
import { FriendRaceDialog } from "./FriendRaceDialog";
import type { Puzzle } from "../../types/puzzle";

/** One solve to play back: who, in which colour, how long it took, and its letters. */
export interface ReplaySolve {
  name: string;
  color: string;
  seconds: number;
  events: TraceEvent[];
}

interface ReplayDialogProps {
  puzzle: Puzzle;
  /** One solve, or a race: two on one clock, watched by either side. */
  solves: ReplaySolve[];
  onClose: () => void;
}

const NO_HIGHLIGHT = new Set<string>();

/**
 * Solves played back, sped up (race.ts). Two or more are a race, and a race
 * has one view wherever it is watched (Andrew, 2026-11-17): the race dialog,
 * lanes and who got to each square first, with both solves on one board as
 * its other reading. One solve plays here with its letters.
 */
export function ReplayDialog({ puzzle, solves, onClose }: ReplayDialogProps) {
  const racers = useMemo<RaceSolve[]>(() => solves.map((s, i) => ({ id: `solve-${i}`, ...s })), [solves]);
  if (solves.length < 2) return <SoloReplay puzzle={puzzle} solves={solves} onClose={onClose} />;
  // Letters only from recordings the server gave with letters (the viewer has finished the puzzle).
  const letters = solves.every((s) => s.events.every((e) => typeof e[2] === "string"));
  return <FriendRaceDialog puzzle={puzzle} solves={racers} letters={letters} onClose={onClose} />;
}

/**
 * One solve played back: its letters, or dots when the recording came
 * without them (the viewer has not solved the puzzle), so nothing is given
 * away.
 */
function SoloReplay({ puzzle, solves, onClose }: ReplayDialogProps) {
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

  const [a] = solves;
  const letters = useMemo(() => cellsAt(a, ms, puzzle.width), [a, ms, puzzle.width]);
  // A recording without letters (the viewer has not solved the puzzle) plays as dots.
  const dotted = a.events.some((e) => typeof e[2] !== "string");
  const dots = useMemo(() => (dotted ? dotsAt(a, ms, puzzle.width) : undefined), [dotted, a, ms, puzzle.width]);
  const title = t("ghostRace.replayTitle", { name: a.name });
  const subtitle = t("ghostRace.replaySubtitle", { time: formatDuration(a.seconds), speed });

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
        {/* The grid sizes itself from the viewport, as in the room's replay: as big as the width or the height leaves, capped, and the panel wraps it. */}
        <div className="mt-4" style={{ "--native-grid-size": "min(calc(100vw - 4.5rem), calc(100svh - 17rem), 30rem)" } as React.CSSProperties}>
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
