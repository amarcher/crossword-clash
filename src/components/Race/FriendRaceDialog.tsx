import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleHelp, FastForward, Pause, Play, RotateCcw, Share2, X } from "lucide-react";
import { Button } from "../ui";
import { CrosswordGrid } from "../CrosswordGrid";
import { StudioPopover } from "../Studio/StudioPopover";
import { blendOnWhite } from "../CrosswordGrid/Cell";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import { formatShareDay } from "../../lib/shareBlock";
import { replaySpeed, whiteCellCount } from "../../lib/race";
import { firstToSquare, progressAt, raceLane, raceShareCode, raceShareOrder, RACE_SHOWN_AT_FIRST, runningOrder, squaresFirst, type RaceSolve } from "../../lib/friendRace";
import { cellsAt, dotsAt } from "../../lib/replayCells";
import { buildPuzzleLink } from "../../lib/dailyChallenge";
import { createReplayShare } from "../../lib/replayShare";
import { SHARE_URL } from "../../lib/resultCard";
import { shareText } from "../../lib/shareSheet";
import { runtimeDeps } from "../CompletionModal/ShareResultButton";
import { track } from "../../lib/analytics";
import type { Puzzle, PuzzleRef } from "../../types/puzzle";

interface FriendRaceDialogProps {
  puzzle: Puzzle;
  /** The viewer's own solve first when there is one, then friends, fastest first. */
  solves: RaceSolve[];
  /** The viewer has solved the puzzle: squares show their letters. Otherwise colour only, so nothing is given away. */
  letters: boolean;
  /** Where the site links to this puzzle, when the puzzle does not carry it (today's daily): what Share sends. */
  shareRef?: PuzzleRef | null;
  onClose: () => void;
}

/** Squares in a lane's track. */
const TRACK = 24;
const NO_HIGHLIGHT = new Set<string>();
const SLOT_LABEL = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

/**
 * The race (friendRace.ts): everyone's recorded solve of one puzzle on one
 * clock, and the one view every replay of a race opens (Andrew, 2026-11-17:
 * two different race views were one too many). Lanes show how much of the
 * grid each had settled; a lane keeps its row for the whole race and only its
 * place number changes, since rows trading places was jarring. The grid
 * takes the colour of whoever settled each square first, with the count of
 * squares each was first to. Names at the top show or hide a solver, and both
 * readings are worked out again for whoever is left.
 *
 * Two solvers with their letters can also be watched as both solves at once:
 * the first's letters filling in, the second's squares as the corner mark a
 * live race draws (what the head-to-head replay used to be).
 *
 * The dialog says which puzzle and little else (Andrew, 2026-11-17): how to
 * read the lanes and the grid is behind the "?" beside Close, so it costs no
 * height, and the lanes sit right above the grid.
 *
 * Share (a puzzle with a link of its own, up to eight solvers showing) sends
 * that link carrying a clip of the grid filling in by who got there first,
 * and the solvers' names, so it reads the same to each of them. No letters.
 */
export function FriendRaceDialog({ puzzle, solves, letters, shareRef: givenRef, onClose }: FriendRaceDialogProps) {
  const { t, i18n } = useTranslation();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  // A big circle opens on its first eight (the viewer and the fastest friends); the rest are a tap away.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(solves.slice(RACE_SHOWN_AT_FIRST).map((s) => s.id)));
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

  // The clip is of whoever is showing now; filed once per selection.
  const shareRef = givenRef ?? puzzle.ref;
  const shareCode = useMemo(() => (shareRef ? raceShareCode(puzzle, lanes) : null), [shareRef, puzzle, lanes]);
  const filed = useRef<{ code: string; id: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const share = async () => {
    if (!shareRef || sharing) return;
    if (!shareCode) {
      // A clip holds eight solvers: say so instead of a button that does nothing.
      setToast(t("friendRace.shareTooMany", { max: RACE_SHOWN_AT_FIRST }));
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSharing(true);
    try {
      const id = filed.current?.code === shareCode ? filed.current.id : await createReplayShare(shareCode);
      if (id) filed.current = { code: shareCode, id };
      // Named only when everyone is: a viewer without a username is "You", which means nothing to the others.
      const you = t("ghostRace.you");
      const who = raceShareOrder(lanes).map((i) => lanes[i].solve.name);
      const url = buildPuzzleLink(SHARE_URL, shareRef, { replay: id ?? undefined, race: lanes.length, who: who.includes(you) ? undefined : who });
      const body = t("friendRace.shareText", { title: puzzle.title, count: lanes.length });
      const result = await shareText({ text: `${body}\n${url}`, body, url, title: t("friendRace.title") }, await runtimeDeps());
      if (result.outcome === "dismissed") return;
      track("friend_race_shared", { method: result.method, racers: lanes.length, clip: !!id });
      setToast(t(result.outcome === "failed" ? "completion.shareFailed" : result.outcome === "copied" ? "friendRace.shareCopied" : "friendRace.shareSent"));
      setTimeout(() => setToast(null), 2200);
    } catch {
      // Sharing must never break the race.
    } finally {
      setSharing(false);
    }
  };

  const order = runningOrder(lanes, ms, total);
  // Both solves on one board, for a head-to-head whose recordings carry their letters.
  const [both, setBoth] = useState(false);
  const canShowBoth = letters && lanes.length === 2;
  const showBoth = both && canShowBoth;
  const [a, b] = lanes.map((l) => l.solve);
  // Which puzzle: "Daily Mini · Nov 17 · Bread Basket" for a daily, the title alone otherwise.
  const about = [...(shareRef && "day" in shareRef ? [t(SLOT_LABEL[shareRef.slot]), formatShareDay(shareRef.day, i18n.language)] : []), puzzle.title].filter(Boolean).join(" · ");
  const counts = squaresFirst(first, lanes.length, ms);
  const standings = lanes.map((_, i) => i).sort((a, b) => counts[b] - counts[a] || a - b);

  return (
    <div className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center" style={{ padding: "max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))" }}>
      <div className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="lf-pop-in relative flex max-h-full w-full max-w-md flex-col sm:max-w-3xl overflow-hidden rounded-2xl border border-line bg-surface text-ink shadow-overlay">
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pb-4">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-muted" data-testid="race-puzzle">{about}</p>
              <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">{solves.length === 2 ? t("ghostRace.raceTitle", { a: solves[0].name, b: solves[1].name }) : t("friendRace.title")}</h2>
              <p className="text-sm text-muted">{solves.length === 1 ? t("friendRace.subtitleOne", { name: solves[0].name }) : t(solves.length === 2 ? "friendRace.subtitleTwo" : "friendRace.subtitle")}</p>
            </div>
            <StudioPopover label={t("friendRace.legendLabel")} icon={<CircleHelp className="size-5" aria-hidden="true" />} className="-mt-2 ml-auto shrink-0" large narrow>
              {/* A key, not a paragraph: each mark as it is drawn, and a few words. */}
              <ul className="grid gap-2 text-sm font-medium text-ink">
                <li className="flex items-center gap-2.5">
                  <span className="flex h-3 w-6 shrink-0 gap-px" aria-hidden="true">
                    {[0, 1, 2, 3].map((n) => (
                      <span key={n} className="h-full flex-1 rounded-[2px] bg-surface-sunken" style={n < 3 ? { backgroundColor: blendOnWhite(a.color, 0.6) } : undefined} />
                    ))}
                  </span>
                  {t("friendRace.legendLanes")}
                </li>
                {/* The grid's marks, for the reading that is showing. */}
                {(showBoth ? [a] : lanes.map((l) => l.solve)).map((solve) => (
                  <li key={solve.id} className="flex items-center gap-2.5">
                    <span className="mx-0.5 grid size-5 shrink-0 place-items-center rounded-[3px] text-[11px] font-bold leading-none text-ink ring-1 ring-inset ring-ink/25" style={{ backgroundColor: blendOnWhite(solve.color, showBoth ? 0.18 : letters ? 0.4 : 0.6) }} aria-hidden="true">
                      {letters && "A"}
                    </span>
                    {t(showBoth ? "friendRace.legendLetters" : "friendRace.legendFirst", { name: solve.name })}
                  </li>
                ))}
                {showBoth && (
                  <li className="flex items-center gap-2.5">
                    <span className="mx-0.5 size-5 shrink-0 overflow-hidden rounded-[3px] bg-surface ring-1 ring-inset ring-ink/25" aria-hidden="true">
                      <span className="block size-full opacity-85" style={{ backgroundColor: b.color, clipPath: "polygon(100% 45%, 100% 100%, 45% 100%)" }} />
                    </span>
                    {t("friendRace.bothBody", { b: b.name })}
                  </li>
                )}
                <li className="flex items-center gap-2.5">
                  <FastForward className="mx-1 size-4 shrink-0 text-muted" aria-hidden="true" />
                  {t("friendRace.legendSpeed", { speed })}
                </li>
              </ul>
            </StudioPopover>
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
                    className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${on ? "border-line-strong bg-surface text-ink" : "border-line bg-surface-sunken text-muted line-through"}`}
                  >
                    <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: on ? s.color : "transparent", boxShadow: on ? undefined : "inset 0 0 0 1.5px currentColor" }} aria-hidden="true" />
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {canShowBoth && (
            <div role="group" aria-label={t("friendRace.viewLabel")} className="mt-3 flex gap-1.5">
              {([false, true] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  aria-pressed={both === v}
                  onClick={() => setBoth(v)}
                  className={`min-h-11 rounded-full border px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${both === v ? "border-line-strong bg-surface text-ink" : "border-line bg-surface-sunken text-muted"}`}
                >
                  {t(v ? "friendRace.viewBoth" : "friendRace.firstTitle")}
                </button>
              ))}
            </div>
          )}

          {/* Side by side where there is room; on a phone the lanes sit right above the grid. */}
          <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <section className="min-w-0" aria-label={t("friendRace.lanesTitle")}>
              <ol className="grid gap-2">
                {lanes.map(({ solve }, i) => {
                  const place = order.indexOf(i);
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

            <section className="min-w-0" aria-label={t(showBoth ? "friendRace.viewBoth" : "friendRace.firstTitle")}>
              {showBoth ? (
                <div className="mx-auto w-fit" style={{ "--native-grid-size": "min(calc(100vw - 4.5rem), calc(100svh - 24rem), 21rem)" } as React.CSSProperties}>
                  <CrosswordGrid puzzle={puzzle} playerCells={cellsAt(a, ms, puzzle.width)} selectedCell={null} highlightedCells={NO_HIGHLIGHT} onCellClick={() => undefined} interactive={false} playerColorMap={{ replay: a.color }} ghostTints={dotsAt(b, ms, puzzle.width)} />
                </div>
              ) : (
              <div
                role="img"
                aria-label={t("friendRace.gridLabel")}
                className="mx-auto grid gap-px overflow-hidden rounded-md border-2 border-ink bg-ink"
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
              )}
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
          {/* Icon only: the clock bar and Share need the width on a phone. */}
          <Button
            variant="secondary"
            size="sm"
            className="size-11 shrink-0 px-0!"
            aria-label={playing ? t("ghostRace.replayPause") : ms >= endMs ? t("ghostRace.replayAgain") : t("ghostRace.replayPlay")}
            onClick={() => (ms >= endMs ? (setMs(0), setPlaying(true)) : setPlaying((p) => !p))}
          >
            {playing ? <Pause className="size-4" aria-hidden="true" /> : ms >= endMs ? <RotateCcw className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
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
          {shareRef && (
            <Button variant="primary" size="sm" onClick={() => void share()} disabled={sharing} data-testid="race-share">
              <Share2 className="size-4" aria-hidden="true" />
              {t("friendRace.share")}
            </Button>
          )}
        </div>
        {toast && (
          <p role="status" className="border-t border-line px-5 py-2 text-center text-xs font-semibold text-ink-soft">
            {toast}
          </p>
        )}
      </div>
    </div>
  );
}
