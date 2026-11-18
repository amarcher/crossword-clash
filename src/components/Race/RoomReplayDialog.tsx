import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { CrosswordGrid } from "../CrosswordGrid";
import { Button, buttonClass } from "../ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import { replaySpeed } from "../../lib/race";
import { roomReplayAt, type RoomReplay } from "../../lib/roomReplay";
import type { Puzzle } from "../../types/puzzle";

interface RoomReplayDialogProps {
  puzzle: Puzzle;
  replay: RoomReplay;
  /** The room's players in standings order: the legend, and each one's running count. */
  players: { userId: string; displayName: string; color: string }[];
  /** userId → colour, as the game's grid has it. */
  playerColorMap: Record<string, string>;
  /** The TV's finish screen is on the dark stage. */
  darkMode?: boolean;
  /** In place of "Race replay" and its line, when the replay is not a room's (SharedRace). */
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

const NO_HIGHLIGHT = new Set<string>();

/**
 * A finished shared-grid race played back (roomReplay.ts): one grid filling
 * in, each square in its claimant's colour, with every player's count as it
 * grows. Sped up like a solo replay (race.ts). Offered after the finish, on
 * the phones and the TV.
 */
export function RoomReplayDialog({ puzzle, replay, players, playerColorMap, darkMode, title, subtitle, onClose }: RoomReplayDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  const endMs = replay.durationMs;
  const seconds = Math.round(endMs / 1000);
  const speed = replaySpeed(seconds);
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

  const { cells, counts } = useMemo(() => roomReplayAt(replay, ms), [replay, ms]);
  const done = ms >= endMs;

  const panel = darkMode ? "border-stage-line bg-stage-raised text-white" : "border-line bg-surface text-ink";
  const sub = darkMode ? "text-white/60" : "text-muted";
  const closeTone = darkMode ? "text-white/60 hover:bg-white/10 active:bg-white/10" : "text-muted hover:bg-surface-sunken active:bg-surface-sunken";

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center" style={{ padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))" }}>
      <div className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      {/* The grid sizes itself from the viewport (CrosswordGrid): as big as the
          width or the height leaves room for, so the whole replay fits a phone
          and a TV without scrolling, and the panel wraps it. */}
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`lf-pop-in relative max-h-full w-fit max-w-full overflow-y-auto rounded-2xl border p-5 shadow-overlay ${panel}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">{title ?? t("roomReplay.title")}</h2>
            <p className={`text-sm text-balance ${sub}`}>{subtitle ?? t("roomReplay.subtitle", { time: formatDuration(seconds), speed })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("ghostRace.close")} className={`-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500 ${closeTone}`}>
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t("roomReplay.playersLabel")}>
          {players.map((p) => (
            <li key={p.userId} className="flex min-w-0 items-center gap-1.5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
              <span className="min-w-0 truncate font-semibold">{p.displayName}</span>
              <span className={`font-mono tabular-nums ${sub}`} data-testid={`replay-count-${p.userId}`}>
                {counts[p.userId] ?? 0}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3" style={{ "--native-grid-size": "min(calc(100vw - 4.5rem), calc(100svh - 17rem), 44rem)" } as React.CSSProperties}>
          <CrosswordGrid puzzle={puzzle} playerCells={cells} selectedCell={null} highlightedCells={NO_HIGHLIGHT} onCellClick={() => undefined} interactive={false} playerColorMap={playerColorMap} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          {darkMode ? (
            <button type="button" className={buttonClass("stage", "sm")} onClick={() => (done ? (setMs(0), setPlaying(true)) : setPlaying((p) => !p))}>
              {playing ? <Pause className="size-4" aria-hidden="true" /> : done ? <RotateCcw className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {playing ? t("ghostRace.replayPause") : done ? t("ghostRace.replayAgain") : t("ghostRace.replayPlay")}
            </button>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => (done ? (setMs(0), setPlaying(true)) : setPlaying((p) => !p))}>
              {playing ? <Pause className="size-4" aria-hidden="true" /> : done ? <RotateCcw className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
              {playing ? t("ghostRace.replayPause") : done ? t("ghostRace.replayAgain") : t("ghostRace.replayPlay")}
            </Button>
          )}
          <span className={`h-1.5 flex-1 overflow-hidden rounded-full ${darkMode ? "bg-white/15" : "bg-line"}`} aria-hidden="true">
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${(ms / endMs) * 100}%` }} />
          </span>
          <span className={`font-mono text-xs tabular-nums ${sub}`}>{formatDuration(Math.floor(ms / 1000))}</span>
        </div>
      </div>
    </div>
  );
}
