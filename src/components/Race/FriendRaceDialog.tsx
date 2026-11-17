import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pause, Play, RotateCcw, X } from "lucide-react";
import { Button } from "../ui";
import { blendOnWhite } from "../CrosswordGrid/Cell";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import { replaySpeed, whiteCellCount } from "../../lib/race";
import { firstToSquare, progressAt, raceLane, runningOrder, squaresFirst, type RaceSolve } from "../../lib/friendRace";
import type { Puzzle } from "../../types/puzzle";

interface FriendRaceDialogProps {
  puzzle: Puzzle;
  /** The viewer's own solve first when there is one, then friends, fastest first. */
  solves: RaceSolve[];
  /** The viewer has solved the puzzle: squares show their letters. Otherwise colour only, so nothing is given away. */
  letters: boolean;
  onClose: () => void;
}

/** Squares in a lane's track. */
const TRACK = 24;

/**
 * The race (friendRace.ts): everyone's recorded solve of one puzzle on one
 * clock. Lanes show how much of the grid each had settled, in running order;
 * the grid below takes the colour of whoever settled each square first, with
 * the count of squares each was first to. Names at the top show or hide a
 * solver, and both readings are worked out again for whoever is left.
 */
export function FriendRaceDialog({ puzzle, solves, letters, onClose }: FriendRaceDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const shown = useMemo(() => solves.filter((s) => !hidden.has(s.id)), [solves, hidden]);
  const lanes = useMemo(() => shown.map(raceLane), [shown]);
  const first = useMemo(() => firstToSquare(lanes), [lanes]);
  const total = useMemo(() => whiteCellCount(puzzle), [puzzle]);

  // One clock for every solver, whoever is shown: hiding someone never changes the pace.
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

  const scrub = (to: number) => {
    setPlaying(false);
    setMs(to);
  };
  const toggle = (id: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      // The last solver showing stays: an empty race is nothing to look at.
      else if (solves.length - next.size > 1) next.add(id);
      return next;
    });

  const order = runningOrder(lanes, ms, total);
  const counts = squaresFirst(first, lanes.length, ms);
  const standings = lanes.map((_, i) => i).sort((a, b) => counts[b] - counts[a] || a - b);

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center" style={{ padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))" }}>
      <div className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="lf-pop-in relative flex max-h-full w-full max-w-md flex-col sm:max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-overlay">
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">{t("friendRace.title")}</h2>
              <p className="text-sm text-muted text-balance">{t("friendRace.subtitle", { title: puzzle.title, speed })}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t("ghostRace.close")} className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500">
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          {solves.length > 2 && (
            <div role="group" aria-label={t("friendRace.showing")} className="-mx-1 mt-3 flex flex-wrap gap-1.5 px-1">
              {solves.map((s) => {
                const on = !hidden.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(s.id)}
                    className={`inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${on ? "border-line-strong bg-surface text-ink" : "border-line bg-surface-sunken text-muted line-through"}`}
                  >
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: on ? s.color : "transparent", boxShadow: on ? undefined : "inset 0 0 0 1.5px currentColor" }} aria-hidden="true" />
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Side by side where there is room, so the lanes and the grid are watched together. */}
          <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <section className="min-w-0">
              <h3 className="text-sm font-bold">{t("friendRace.lanesTitle")}</h3>
              <ol className="mt-1.5 grid gap-2">
                {order.map((i, place) => {
                  const { solve } = lanes[i];
                  const done = ms >= solve.seconds * 1000;
                  const p = progressAt(lanes[i], ms, total);
                  const lit = Math.round(p * TRACK);
                  return (
                    <li key={solve.id} data-testid="race-lane">
                      <div className="flex items-baseline gap-2 text-xs">
                        <span className="w-3 shrink-0 font-mono tabular-nums text-muted">{place + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{solve.name}</span>
                        <span className={`inline-flex items-center gap-0.5 font-mono tabular-nums ${done ? "font-bold text-ink" : "text-muted"}`}>
                          {done && <Check className="size-3.5" aria-hidden="true" />}
                          {done ? formatDuration(solve.seconds) : `${Math.floor(p * 100)}%`}
                        </span>
                      </div>
                      <div className="relative mt-1 flex h-4 gap-px" role="img" aria-label={t("ghostRace.progressLabel", { name: solve.name })}>
                        {Array.from({ length: TRACK }, (_, n) => (
                          <span key={n} className="h-full flex-1 rounded-[2px] bg-surface-sunken" style={n < lit ? { backgroundColor: blendOnWhite(solve.color, 0.6) } : undefined} />
                        ))}
                        <span
                          className="absolute top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-[5px] text-[11px] font-bold leading-none text-white shadow-sm"
                          style={{ backgroundColor: solve.color, left: `calc(${p} * (100% - 1.25rem))` }}
                          aria-hidden="true"
                        >
                          {[...solve.name][0]?.toUpperCase()}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="min-w-0">
              <h3 className="text-sm font-bold">{t("friendRace.firstTitle")}</h3>
              <p className="text-xs text-muted">{t("friendRace.firstBody")}</p>
              <div
                role="img"
                aria-label={t("friendRace.gridLabel")}
                className="mx-auto mt-2 grid gap-px overflow-hidden rounded-md border-2 border-ink bg-ink"
                style={{ gridTemplateColumns: `repeat(${puzzle.width}, minmax(0, 1fr))`, maxWidth: "min(100%, calc(100svh - 20rem))", minWidth: "min(100%, 14rem)" }}
              >
                {puzzle.cells.flat().map((cell) => {
                  const index = cell.row * puzzle.width + cell.col;
                  if (cell.solution === null) return <span key={index} className="aspect-square bg-ink" />;
                  const held = first.get(index);
                  const owner = held && held.ms <= ms ? lanes[held.lane].solve : null;
                  return (
                    <span
                      key={index}
                      data-owner={owner?.id}
                      className="grid aspect-square place-items-center bg-surface font-bold leading-none text-ink"
                      style={{ containerType: "inline-size", backgroundColor: owner ? blendOnWhite(owner.color, letters ? 0.4 : 0.6) : undefined }}
                    >
                      {letters && owner && <span style={{ fontSize: "62cqi" }}>{cell.solution}</span>}
                    </span>
                  );
                })}
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t("friendRace.standingsLabel")}>
                {standings.map((i) => (
                  <li key={lanes[i].solve.id} data-testid="race-standing" className="inline-flex min-w-0 items-center gap-1.5">
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: lanes[i].solve.color }} aria-hidden="true" />
                    <span className="truncate font-semibold">{lanes[i].solve.name}</span>
                    <span className="font-mono tabular-nums text-muted">{counts[i]}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-line px-5 py-3">
          <Button variant="secondary" size="sm" onClick={() => (ms >= endMs ? (setMs(0), setPlaying(true)) : setPlaying((p) => !p))}>
            {playing ? <Pause className="size-4" aria-hidden="true" /> : ms >= endMs ? <RotateCcw className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            {playing ? t("ghostRace.replayPause") : ms >= endMs ? t("ghostRace.replayAgain") : t("ghostRace.replayPlay")}
          </Button>
          <input
            type="range"
            min={0}
            max={endMs}
            step={250}
            value={ms}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label={t("friendRace.scrub")}
            className="h-11 min-w-0 flex-1 accent-brand-500"
          />
          <span className="font-mono text-xs tabular-nums text-muted">{formatDuration(Math.floor(ms / 1000))}</span>
        </div>
      </div>
    </div>
  );
}
