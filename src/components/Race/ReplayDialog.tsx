import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { CrosswordGrid } from "../CrosswordGrid";
import { Button } from "../ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import { ghostAt, replaySpeed, type TraceEvent } from "../../lib/race";
import type { CellState, Puzzle } from "../../types/puzzle";

interface ReplayDialogProps {
  puzzle: Puzzle;
  name: string;
  color: string;
  seconds: number;
  events: TraceEvent[];
  onClose: () => void;
}

const NO_HIGHLIGHT = new Set<string>();

/**
 * Someone's solve played back with its letters, sped up (race.ts). Offered
 * once the viewer has finished the puzzle, so nothing is given away.
 */
export function ReplayDialog({ puzzle, name, color, seconds, events, onClose }: ReplayDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  const speed = replaySpeed(seconds);
  const endMs = seconds * 1000;
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

  const cells = useMemo(() => {
    const out: Record<string, CellState> = {};
    for (const [cell, letter] of ghostAt({ events, seconds }, ms).filled) {
      if (typeof letter !== "string") continue;
      out[`${Math.floor(cell / puzzle.width)},${cell % puzzle.width}`] = { letter, correct: true, playerId: "replay" };
    }
    return out;
  }, [events, seconds, ms, puzzle.width]);
  const colors = useMemo(() => ({ replay: color }), [color]);

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center" style={{ padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))" }}>
      <div className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="lf-pop-in relative max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-5 text-ink shadow-overlay">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">{t("ghostRace.replayTitle", { name })}</h2>
            <p className="text-sm text-muted">{t("ghostRace.replaySubtitle", { time: formatDuration(seconds), speed })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("ghostRace.close")} className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4">
          <CrosswordGrid puzzle={puzzle} playerCells={cells} selectedCell={null} highlightedCells={NO_HIGHLIGHT} onCellClick={() => undefined} interactive={false} playerColorMap={colors} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => (ms >= endMs ? (setMs(0), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? <Pause className="size-4" aria-hidden="true" /> : ms >= endMs ? <RotateCcw className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {playing ? t("ghostRace.replayPause") : ms >= endMs ? t("ghostRace.replayAgain") : t("ghostRace.replayPlay")}
          </Button>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${(ms / Math.max(1, endMs)) * 100}%`, backgroundColor: color }} />
          </span>
          <span className="font-mono text-xs tabular-nums text-muted">{formatDuration(Math.floor(ms / 1000))}</span>
        </div>
      </div>
    </div>
  );
}
