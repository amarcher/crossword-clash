import { useCallback, useEffect, useRef, useState } from "react";
import { displayTheme } from "../../lib/dailyFeed";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, Flame, Newspaper, Swords, Trophy, UserRound, type LucideIcon } from "lucide-react";
import { buttonClass } from "../ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import {
  isFreshCompletion,
  prefersReducedMotion,
  CONFETTI_DURATION_MS,
} from "../../lib/celebration";
import { playWinSound } from "../../lib/winSound";
import { computeViewerStanding, SHARE_URL } from "../../lib/resultCard";
import { Confetti } from "./Confetti";
import { ShareResultButton } from "./ShareResultButton";
import { SaveImageButton } from "./SaveImageButton";
import { SendToFriend } from "../Friends";
import { ReminderSwitch } from "../Push";
import type { DailySlot } from "../../lib/dailyFeed";
import { BoardSignForm } from "../BoardSignForm";
import { buildShareBlock, claimantLegend, MAX_ROW_WIDTH, type ShareBlock } from "../../lib/shareBlock";
import { buildDailyLink } from "../../lib/dailyChallenge";
import { buildChallengeUrl } from "../../lib/challenge";
import { compressPuzzleToHash } from "../../lib/puzzleUrl";
import { todayKey } from "../../lib/dailyLeaderboard";
import { Capacitor } from "@capacitor/core";
import { track } from "../../lib/analytics";
import type { NextUpItem } from "../../lib/nextUp";
import { AdSlot } from "../AdSlot";
import { NytRecommendation } from "../NytRecommendation";
import type { CellState, Puzzle } from "../../types/puzzle";
import type { ChallengeComparison } from "../../lib/challenge";
import type { RaceStandingRow } from "../../lib/raceResults";

const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

export interface PlayerResult {
  userId: string;
  displayName: string;
  color: string;
  cellsClaimed: number;
  cluesCompleted: number;
}

interface CompletionModalProps {
  open: boolean;
  /** Puzzle title, used on the shareable result card. */
  puzzleTitle?: string;
  totalCells: number;
  totalClues: number;
  soloScore?: number;
  /** Solo finish time in seconds (omit to hide the time row). */
  finishSeconds?: number;
  /** Best solo time on record for this puzzle, in seconds. */
  bestSeconds?: number;
  /** Whether this finish set a new personal record. */
  isNewBest?: boolean;
  /** Best on record *before* this finish (null on the first-ever solve). */
  previousBest?: number | null;
  /**
   * The grid was finished with a revealed square (solo, Autocheck off): the
   * time row says so instead of claiming a best, since none was recorded.
   */
  assisted?: boolean;
  /** Current daily-play streak (omit/0 to hide the streak row). */
  streakCount?: number;
  /**
   * Present when the finished puzzle came from the NYT bookmarklet: shows the
   * "same time tomorrow" nudge and, when > 0, the NYT streak. This is the
   * bookmarklet's return loop — the whole reason it is worth installing.
   */
  nytHook?: { streak: number };
  /**
   * Multiplayer: the shared race time in whole seconds (host start → grid
   * complete). Shown as the headline time and stamped on the share card.
   */
  raceSeconds?: number | null;
  /**
   * Shown as a "Daily leaderboard" action when the finished puzzle is today's
   * daily mini — routes the finisher to the cross-day board.
   */
  onViewLeaderboard?: () => void;
  /** Which daily this was ("mini" | "midi" | "large"), so the share text can say so. */
  dailySlot?: DailySlot;
  /**
   * "Sign the board": present only when a daily time was just submitted under
   * the anonymous default name. `onSign` claims the entry (also fired when the
   * finisher signs a challenge link, so one name covers both); `signedAs`
   * flips the form into a confirmation once a name lands.
   */
  dailySign?: { signedAs?: string | null; onSign: (name: string) => void };
  /**
   * Async ("time trial") mode: per-player standings ranked by finish time.
   * When present the player table shows times instead of cells/clues, and
   * still-solving players read as "Solving…".
   */
  raceStandings?: RaceStandingRow[];
  /** Co-op mode: frame the result as a team finish (no winner ranking). */
  coop?: boolean;
  players?: PlayerResult[];
  /**
   * The viewing player's Supabase user id. When it matches a player, the share
   * card brags this viewer's own standing; absent (spectator) → winner card.
   */
  currentUserId?: string;
  /**
   * The finished puzzle. Drives the share block (its rows are the grid's) and
   * the challenge link; without it the modal offers no Share at all.
   */
  challengePuzzle?: Puzzle;
  /** The solver's cells, for the block's pace colours (and claimants in a live race). */
  playerCells?: Record<string, CellState>;
  /** "row,col" keys that took a wrong letter at least once — red in the block. */
  wrongCells?: readonly string[];
  /**
   * Live race (shared grid): hex colour per player id. When present the block
   * colours cells by claimant instead of pace. Omit for solo and async races.
   */
  playerColors?: Record<string, string>;
  /** The finisher's display name, embedded as the challenger in the link. */
  challengerName?: string;
  /**
   * When the finisher was themselves racing an incoming challenge, the verdict
   * against the challenger's ghost — drives the personal outcome banner.
   */
  challengeOutcome?: ChallengeComparison & { challengerName: string };
  /**
   * "Up next" rows (at most two): today's unsolved dailies, then yesterday's
   * — from `nextUpSuggestions`. Solo/daily only.
   */
  nextUp?: NextUpItem[];
  onNextUp?: (item: NextUpItem) => void;
  /**
   * "Race a friend live": host a FRESH puzzle through the picker, never the
   * one just solved. Passed only when multiplayer is available; absent → the
   * row is hidden.
   */
  onRaceFresh?: () => void;
  /** Puzzle size (e.g. "15x15") for the live-bridge analytics dimension. */
  puzzleSize?: string;
  /**
   * Multiplayer host: "Next puzzle, same room" — the picker, then
   * `createNextGame` with the chosen puzzle (the room code stays).
   */
  onNextPuzzle?: () => void;
  onBackToMenu?: () => void;
  /**
   * Anonymous finisher in a build that offers accounts: a quiet "keep this
   * solve" nudge that opens the sign-in sheet. Omit for signed-in solvers and
   * wherever accounts aren't on offer, so the modal shows nothing extra.
   */
  onSignIn?: () => void;
  darkMode?: boolean;
}

export function CompletionModal({
  open,
  puzzleTitle,
  totalCells,
  totalClues,
  soloScore,
  finishSeconds,
  bestSeconds,
  isNewBest,
  previousBest,
  assisted,
  streakCount,
  nytHook,
  raceSeconds,
  onViewLeaderboard,
  dailySlot,
  dailySign,
  raceStandings,
  coop,
  players,
  currentUserId,
  challengePuzzle,
  playerCells,
  wrongCells,
  playerColors,
  challengerName,
  challengeOutcome,
  nextUp,
  onNextUp,
  onRaceFresh,
  puzzleSize,
  onNextPuzzle,
  onBackToMenu,
  onSignIn,
  darkMode,
}: CompletionModalProps) {
  const { t, i18n } = useTranslation();
  const modalRef = useRef<HTMLDivElement | null>(null);

  const handleEscape = useCallback(() => {
    onBackToMenu?.();
  }, [onBackToMenu]);

  useFocusTrap(open ? modalRef : { current: null }, handleEscape);

  // One-shot celebration: confetti + win chime fire exactly once, on the
  // transition into the completed state. Initialised to `open` so a finished
  // puzzle restored on reload (modal already open at mount) does NOT re-fire.
  const prevOpenRef = useRef(open);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    const fresh = isFreshCompletion(prevOpenRef.current, open);
    prevOpenRef.current = open;
    if (!fresh) return;

    // Sound self-gates on the app mute setting; safe to call unconditionally.
    playWinSound();
    // Large motion is suppressed under prefers-reduced-motion.
    if (!prefersReducedMotion()) setCelebrating(true);
  }, [open]);

  useEffect(() => {
    if (!celebrating) return;
    const id = window.setTimeout(() => setCelebrating(false), CONFETTI_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [celebrating]);


  const isAsync = !!raceStandings && raceStandings.length > 0;
  const isMultiplayer = (players && players.length > 0) || isAsync;
  const ranked = players && players.length > 0
    ? [...players].sort((a, b) => b.cellsClaimed - a.cellsClaimed)
    : [];

  const winner = ranked[0];
  const isTie =
    ranked.length > 1 && ranked[0].cellsClaimed === ranked[1].cellsClaimed;

  // Async standings: fastest finisher leads; unfinished players trail.
  const asyncFinished = isAsync ? raceStandings.filter((r) => r.seconds != null) : [];
  const asyncAllDone = isAsync && asyncFinished.length === raceStandings.length;
  const asyncWinner = asyncFinished[0];
  const asyncTie =
    asyncFinished.length > 1 && asyncFinished[0].seconds === asyncFinished[1].seconds;
  const viewerAsyncRow = isAsync
    ? raceStandings.find((r) => r.userId === currentUserId)
    : undefined;

  // Personal standing for the share card. Async derives from finish times;
  // shared-grid modes keep the cells-claimed ranking. Co-op has no ranking.
  const viewerStanding = isAsync
    ? viewerAsyncRow?.rank != null
      ? {
          rank: viewerAsyncRow.rank,
          total: raceStandings.length,
          won: viewerAsyncRow.rank === 1 && !asyncTie,
          tiedForFirst: viewerAsyncRow.rank === 1 && asyncTie,
        }
      : null
    : isMultiplayer && !coop
      ? computeViewerStanding(ranked, currentUserId)
      : null;

  // The time that headlines the share (solo finish, or the race time).
  const shareSeconds = finishSeconds ?? raceSeconds ?? undefined;
  const shareWinnerName = isAsync ? asyncWinner?.displayName : winner?.displayName;
  const shareIsTie = isAsync ? asyncTie : isTie;

  // The standing line of the share block (a string, so the block builder's
  // dependencies stay stable across renders).
  const shareStanding = !isMultiplayer
    ? undefined
    : coop
      ? t("completion.coopSolved")
      : viewerStanding
        ? t(
            viewerStanding.won
              ? "completion.cardStandingWin"
              : viewerStanding.tiedForFirst
                ? "completion.cardStandingTie"
                : "completion.cardStandingRank",
            { rank: viewerStanding.rank, total: viewerStanding.total },
          )
        : shareIsTie
          ? t("completion.tie")
          : t("completion.wins", { name: shareWinnerName ?? "" });
  // One line under the preview saying what the squares mean. A shared grid
  // is coloured by claimant (named, in the standings order); everything else
  // — solo, an async copy — by the pace of the solve, red for a wrong letter.
  // Grids wider than MAX_ROW_WIDTH share a pace bar instead of rows.
  const wideGrid = !!challengePuzzle && challengePuzzle.width > MAX_ROW_WIDTH;
  const shareLegend = !challengePuzzle
    ? undefined
    : isMultiplayer && playerColors
      ? t(wideGrid ? "completion.legendRaceBar" : "completion.legendRace", { players: claimantLegend(ranked) })
      : t(wideGrid ? "completion.legendSoloBar" : "completion.legendSolo");
  const shareDaily = dailySlot ? t(SLOT_EYEBROW[dailySlot]) : undefined;
  const shareStreak = streakCount && streakCount > 0 ? t("soloStats.streakDays", { count: streakCount }) : undefined;

  // The spoiler-free result block for a given challenger name: the link
  // carries the name (and the ghost time), so it is rebuilt when one is signed.
  const blockFor = useCallback(
    (name: string): ShareBlock => {
      const puzzle = challengePuzzle as Puzzle;
      const link = dailySlot
        ? buildDailyLink(SHARE_URL, { day: todayKey(), slot: dailySlot, seconds: shareSeconds, name })
        : shareSeconds !== undefined
          ? buildChallengeUrl(SHARE_URL, puzzle, { name, seconds: shareSeconds })
          : `${SHARE_URL}/${compressPuzzleToHash(puzzle)}`;
      return buildShareBlock({
        puzzle,
        cells: playerCells ?? {},
        wrongCells,
        seconds: shareSeconds,
        day: dailySlot ? todayKey() : undefined,
        locale: i18n.language,
        playerColors,
        link,
        labels: {
          brand: t("completion.shareBrand"),
          daily: shareDaily,
          streak: shareStreak,
          standing: shareStanding,
          cta: shareSeconds !== undefined ? t("completion.beatMyTime") : t("completion.playIt"),
        },
      });
    },
    [challengePuzzle, dailySlot, shareSeconds, shareDaily, shareStreak, shareStanding, playerCells, wrongCells, playerColors, t, i18n.language],
  );

  if (!open) return null;

  const hasNextUp = !!nextUp && nextUp.length > 0 && !!onNextUp;

  const bg = darkMode ? "bg-stage-raised ring-1 ring-stage-line" : "bg-surface";
  const text = darkMode ? "text-white" : "text-ink";
  const textSub = darkMode ? "text-white/60" : "text-muted";
  const tableBg = darkMode ? "bg-white/5" : "bg-surface-sunken";
  const tableText = darkMode ? "text-white/80" : "text-ink-soft";
  const tableHeader = darkMode ? "text-white/50" : "text-subtle";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-[2px]"
        onClick={onBackToMenu}
      />

      {/* Confetti — mounted only during the one-shot celebration window */}
      {celebrating && <Confetti />}

      {/* Modal */}
      <div
        ref={modalRef}
        className={`modal-enter scroll-quiet relative z-20 w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-3xl ${bg} shadow-overlay p-6 sm:p-8`}
        role="dialog"
        aria-modal="true"
        aria-label={t('completion.ariaLabel')}
      >
        {/* Trophy */}
        <div className="mb-4 flex justify-center">
          <span className={`trophy-pulse grid size-14 place-items-center rounded-full ${darkMode ? "bg-gold-500/15" : "bg-gold-50 ring-1 ring-gold-100"}`}>
            <Trophy className="size-7 text-gold-500" strokeWidth={2} aria-hidden="true" />
          </span>
        </div>

        {/* Title */}
        <h2 className={`font-display text-2xl font-bold tracking-tight text-center mb-1 ${text}`}>
          {t('completion.puzzleComplete')}
        </h2>

        {isMultiplayer ? (
          <>
            {/* Outcome line: async → fastest finisher (or waiting), co-op →
                team finish, versus → most squares solved (the line says so:
                players asked whether it was squares or clues — it is squares). */}
            <p className={`text-center mb-5 ${textSub}`}>
              {isAsync
                ? asyncAllDone
                  ? asyncTie
                    ? t('completion.tie')
                    : t('completion.wins', { name: asyncWinner?.displayName ?? '' })
                  : t('completion.waitingOthers')
                : coop
                  ? t('completion.coopSolved')
                  : isTie
                    ? t('completion.tieSquares', { count: winner.cellsClaimed })
                    : t('completion.winsSquares', { name: winner.displayName, count: winner.cellsClaimed })}
            </p>

            {/* Headline time: your own finish (async) or the shared race time. */}
            {raceSeconds != null && (
              <div className={`mb-5 rounded-xl px-4 py-3 text-center ${tableBg}`}>
                <div className={`font-display text-4xl font-bold tracking-tight tabular-nums ${text}`}>
                  {formatDuration(raceSeconds)}
                </div>
                <div className={`mt-0.5 text-sm font-medium ${textSub}`}>
                  {isAsync ? t('completion.yourTime') : t('completion.raceTime')}
                </div>
              </div>
            )}

            {/* Standings table */}
            {isAsync ? (
              <div className={`rounded-xl overflow-hidden ${tableBg} mb-6`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-xs uppercase tracking-wider ${tableHeader}`}>
                      <th className="text-left py-2 px-3">#</th>
                      <th className="text-left py-2 px-3">{t('completion.player')}</th>
                      <th className="text-right py-2 px-3">{t('completion.time')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raceStandings.map((row) => (
                      <tr key={row.userId} className={tableText}>
                        <td className="py-2 px-3 font-medium">{row.rank ?? "–"}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: row.color }}
                            />
                            <span className="font-medium truncate">{row.displayName}</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {row.seconds != null ? formatDuration(row.seconds) : t('completion.solving')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={`rounded-xl overflow-hidden ${tableBg} mb-6`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={`text-xs uppercase tracking-wider ${tableHeader}`}>
                      <th className="text-left py-2 px-3">#</th>
                      <th className="text-left py-2 px-3">{t('completion.player')}</th>
                      <th className="text-right py-2 px-3">{t('completion.squares')}</th>
                      <th className="text-right py-2 px-3">{t('completion.clues')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((player, i) => (
                      <tr key={player.userId} className={tableText}>
                        <td className="py-2 px-3 font-medium">{coop ? "•" : i + 1}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: player.color }}
                            />
                            <span className="font-medium truncate">
                              {player.displayName}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {player.cellsClaimed}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {player.cluesCompleted}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className={`text-xs ${tableHeader} border-t ${darkMode ? "border-neutral-600" : "border-neutral-200"}`}>
                      <td colSpan={2} className="py-2 px-3">{t('completion.total')}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{totalCells}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{totalClues}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Solo stats */}
            <p className={`text-center mb-4 ${textSub}`}>
              {t('completion.cellsFilled', { score: soloScore ?? totalCells, total: totalCells })}
            </p>

            {finishSeconds !== undefined && (() => {
              // Celebrate only a genuine record — beating a time that was
              // already on record. The first-ever solve is a best-of-one, not
              // an achievement, so it reads as a plain "your time".
              const celebrateBest = !assisted && isNewBest === true && previousBest != null;
              return (
                <div
                  className={`mb-4 rounded-xl px-4 py-3 text-center ${
                    celebrateBest
                      ? darkMode
                        ? "bg-gold-500/15 ring-1 ring-gold-500/40"
                        : "bg-gold-50 ring-1 ring-gold-100"
                      : tableBg
                  }`}
                >
                  <div className={`font-display text-4xl font-bold tracking-tight tabular-nums ${text}`}>
                    {formatDuration(finishSeconds)}
                  </div>
                  <div
                    className={`mt-0.5 text-sm font-medium ${
                      celebrateBest
                        ? darkMode
                          ? "text-gold-400"
                          : "text-gold-700"
                        : textSub
                    }`}
                  >
                    {assisted
                      ? t('autocheck.solvedWithReveals')
                      : celebrateBest
                      ? t('soloStats.newBestBeat', { time: formatDuration(previousBest as number) })
                      : isNewBest
                        ? t('soloStats.timerLabel')
                        : bestSeconds !== undefined
                          ? t('soloStats.bestTime', { time: formatDuration(bestSeconds) })
                          : t('soloStats.timerLabel')}
                  </div>
                </div>
              );
            })()}

            {streakCount !== undefined && streakCount > 0 && (
              <p className={`mb-5 flex items-center justify-center gap-1.5 text-sm font-semibold ${darkMode ? "text-gold-400" : "text-gold-700"}`}>
                <Flame className="size-4 text-gold-500" aria-hidden="true" />
                {t('soloStats.streakDays', { count: streakCount })}
              </p>
            )}

            {nytHook && (
              <div
                data-testid="nyt-hook"
                className={`mb-5 flex items-start gap-3 rounded-2xl px-4 py-3 text-left text-sm ${
                  darkMode ? "bg-white/5 text-white/80 ring-1 ring-stage-line" : "bg-surface-sunken text-ink-soft"
                }`}
              >
                <Newspaper className={`mt-0.5 size-4 shrink-0 ${darkMode ? "text-white/50" : "text-subtle"}`} aria-hidden="true" />
                <div>
                  {nytHook.streak > 0 && (
                    <p className={`font-semibold ${darkMode ? "text-gold-400" : "text-gold-700"}`}>
                      {t('completion.nytStreak', { count: nytHook.streak })}
                    </p>
                  )}
                  <p className={nytHook.streak > 0 ? "mt-0.5" : ""}>{t('completion.nytTomorrow')}</p>
                </div>
              </div>
            )}

            {dailySign && (
              <BoardSignForm
                currentName={t("common.defaultPlayerName")}
                signedAs={dailySign.signedAs}
                onSign={dailySign.onSign}
                darkMode={darkMode}
                className="mb-5"
              />
            )}

            {challengeOutcome && (
              <div
                className={`mb-6 rounded-xl px-4 py-3 text-center text-base font-bold ${
                  challengeOutcome.outcome === "beat"
                    ? darkMode
                      ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-300"
                      : "bg-emerald-50 border border-emerald-200 text-emerald-700"
                    : challengeOutcome.outcome === "lost"
                      ? darkMode
                        ? "bg-rose-500/15 border border-rose-500/40 text-rose-300"
                        : "bg-rose-50 border border-rose-200 text-rose-700"
                      : darkMode
                        ? "bg-neutral-700/60 border border-neutral-600 text-neutral-200"
                        : "bg-neutral-100 border border-neutral-200 text-neutral-700"
                }`}
              >
                {challengeOutcome.outcome === "beat"
                  ? t("challenge.resultBeat", {
                      name: challengeOutcome.challengerName,
                      delta: formatDuration(challengeOutcome.deltaSeconds),
                    })
                  : challengeOutcome.outcome === "lost"
                    ? t("challenge.resultLost", {
                        name: challengeOutcome.challengerName,
                        delta: formatDuration(challengeOutcome.deltaSeconds),
                      })
                    : t("challenge.resultTied", { name: challengeOutcome.challengerName })}
              </div>
            )}
          </>
        )}

        {onSignIn && (
          <div
            data-testid="account-hook"
            className={`mb-5 flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm ${
              darkMode ? "bg-white/5 text-white/80 ring-1 ring-stage-line" : "bg-surface-sunken text-ink-soft"
            }`}
          >
            <UserRound className={`size-4 shrink-0 ${darkMode ? "text-white/50" : "text-subtle"}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t('completion.saveHistory')}</p>
              <p className={`mt-0.5 text-xs leading-snug ${darkMode ? "text-white/60" : "text-muted"}`}>{t('completion.saveHistoryHint')}</p>
            </div>
            <button type="button" onClick={onSignIn} className={buttonClass(darkMode ? "stage" : "secondary", "sm", "shrink-0")}>
              {t('account.signIn')}
            </button>
          </div>
        )}

        {/* Actions (navigation audit §1 + §2): Share is the one primary, its
            block previewed above it and its link the challenge; then the board
            and "Save image"; then "Up next" and the fresh-puzzle race; "Back
            to menu" is the quiet exit. The importer is never offered here —
            the game header keeps "Load different puzzle". */}
        <div className="flex flex-col gap-2.5">
          {/* One Share: the spoiler-free block (previewed above its button),
              whose link is the challenge. Needs the puzzle for the rows. */}
          {challengePuzzle && (
            <ShareResultButton
              mode={isMultiplayer ? "multiplayer" : "solo"}
              blockFor={blockFor}
              challengerName={(challengerName ?? "").trim() || t("common.defaultPlayerName")}
              hasTime={shareSeconds !== undefined}
              puzzleSize={puzzleSize ?? `${challengePuzzle.width}x${challengePuzzle.height}`}
              daily={!!dailySlot && !isMultiplayer}
              legend={shareLegend}
              onNameSigned={dailySign?.onSign}
              darkMode={darkMode}
            />
          )}
          {/* A daily finish with friends: the beat-my-time link delivered in-app
              (docs/friends-spec.md §3.2). Renders nothing without friends. */}
          {/* The apps, after a daily: the reminder switch in context (docs/friends-spec.md §3.3). */}
          {dailySlot && !isMultiplayer && <ReminderSwitch darkMode={darkMode} />}
          {dailySlot && !isMultiplayer && shareSeconds !== undefined && (
            <SendToFriend
              link={buildDailyLink("", { day: todayKey(), slot: dailySlot, seconds: shareSeconds, name: (challengerName ?? "").trim() || t("common.defaultPlayerName") })}
              darkMode={darkMode}
            />
          )}
          {(onViewLeaderboard || (challengePuzzle && !Capacitor.isNativePlatform())) && (
            <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
              {onViewLeaderboard && (
                <button onClick={onViewLeaderboard} className={buttonClass(darkMode ? "stage" : "secondary", "md", "w-full")}>
                  <Trophy className="size-4 text-gold-500" aria-hidden="true" />
                  {t('completion.viewLeaderboard')}
                </button>
              )}
              {/* The canvas card stays as a secondary "Save image" (the app's
                  WebView cannot save a blob; the plugin for that comes later). */}
              {challengePuzzle && !Capacitor.isNativePlatform() && (
                <SaveImageButton
                  mode={isMultiplayer ? "multiplayer" : "solo"}
                  puzzleTitle={puzzleTitle}
                  finishSeconds={shareSeconds}
                  bestSeconds={bestSeconds}
                  isNewBest={isNewBest}
                  winnerName={shareWinnerName}
                  isTie={shareIsTie}
                  coop={coop}
                  viewerStanding={viewerStanding ?? undefined}
                  darkMode={darkMode}
                />
              )}
            </div>
          )}

          {!isMultiplayer && (hasNextUp || onRaceFresh) && (
            <section aria-labelledby={hasNextUp ? "completion-up-next" : undefined} data-testid="up-next" className="mt-1">
              {hasNextUp && (
                <h3 id="completion-up-next" className={`mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.08em] ${tableHeader}`}>
                  {t('completion.upNext')}
                </h3>
              )}
              <RowGroup darkMode={darkMode}>
                {hasNextUp &&
                  nextUp.map((item) => (
                    <NextUpRow
                      key={item.kind === "daily" ? `daily-${item.slot}` : `archive-${item.entry.day}-${item.entry.slot}`}
                      item={item}
                      onSelect={() => onNextUp(item)}
                      darkMode={darkMode}
                    />
                  ))}
                {onRaceFresh && (
                  <ModalRow
                    icon={Swords}
                    tone="brand"
                    title={t('completion.raceFresh')}
                    subtitle={t('completion.raceFreshHint')}
                    onClick={() => {
                      // The live-bridge funnel event, kept from the old "Play live" CTA.
                      track("live_bridge", { mode: "live", from: challengeOutcome ? "challenge_result" : "solo", size: puzzleSize });
                      onRaceFresh();
                    }}
                    darkMode={darkMode}
                  />
                )}
              </RowGroup>
            </section>
          )}
          {isMultiplayer && onNextPuzzle && (
            <RowGroup darkMode={darkMode}>
              <ModalRow
                icon={Swords}
                tone="brand"
                title={t('completion.nextPuzzleSameRoom')}
                subtitle={t('completion.nextPuzzleSameRoomHint')}
                onClick={onNextPuzzle}
                darkMode={darkMode}
              />
            </RowGroup>
          )}

          {onBackToMenu && (
            <button onClick={onBackToMenu} className={buttonClass("ghost", "md", `w-full ${darkMode ? "text-white/60 hover:text-white hover:bg-white/10" : ""}`)}>
              {t('completion.backToMenu')}
            </button>
          )}
        </div>

        {/* Ad */}
        <div className="flex justify-center mt-4">
          <AdSlot placement="completion-footer" darkMode={darkMode} />
        </div>

        {/* NYT affiliate */}
        <div className="mt-4">
          <NytRecommendation variant="inline" darkMode={darkMode} />
        </div>
      </div>
    </div>
  );
}

const ROW_TONES = {
  brand: { light: "bg-brand-50 text-brand-600", dark: "bg-brand-500/20 text-brand-200" },
  gold: { light: "bg-gold-50 text-gold-700", dark: "bg-gold-500/15 text-gold-400" },
} as const;

function RowGroup({ darkMode, children }: { darkMode?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl ${darkMode ? "divide-y divide-stage-line ring-1 ring-stage-line" : "divide-y divide-line ring-1 ring-line"}`}>
      {children}
    </div>
  );
}

/** One tappable row of the modal's "what next" list: icon tile, title + subtitle, chevron. */
function ModalRow({
  icon: Icon,
  tone,
  title,
  subtitle,
  onClick,
  darkMode,
}: {
  icon: LucideIcon;
  tone: keyof typeof ROW_TONES;
  title: string;
  subtitle?: string;
  onClick: () => void;
  darkMode?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
        darkMode ? "hover:bg-white/5 active:bg-white/10" : "hover:bg-surface-sunken/70 active:bg-surface-sunken"
      }`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${ROW_TONES[tone][darkMode ? "dark" : "light"]}`}>
        <Icon className="size-4.5" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold leading-snug ${darkMode ? "text-white" : "text-ink"}`}>{title}</span>
        {subtitle && <span className={`mt-0.5 block truncate text-xs leading-snug ${darkMode ? "text-white/60" : "text-muted"}`}>{subtitle}</span>}
      </span>
      <ChevronRight className={`size-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${darkMode ? "text-white/40" : "text-subtle"}`} aria-hidden="true" />
    </button>
  );
}

function NextUpRow({ item, onSelect, darkMode }: { item: NextUpItem; onSelect: () => void; darkMode?: boolean }) {
  const { t } = useTranslation();
  if (item.kind === "daily") {
    const { puzzle } = item.daily;
    const size = `${puzzle.width}×${puzzle.height}`;
    return (
      <ModalRow
        icon={CalendarDays}
        tone="gold"
        title={t(SLOT_EYEBROW[item.slot])}
        subtitle={displayTheme(item.daily) ? `${size} · ${displayTheme(item.daily)}` : size}
        onClick={onSelect}
        darkMode={darkMode}
      />
    );
  }
  const { entry } = item;
  const size = `${entry.width}×${entry.height}`;
  return (
    <ModalRow
      icon={CalendarDays}
      tone="gold"
      title={t("completion.nextYesterday", { daily: t(SLOT_EYEBROW[entry.slot]) })}
      subtitle={entry.theme ? `${size} · ${entry.theme}` : `${size} · ${entry.title}`}
      onClick={onSelect}
      darkMode={darkMode}
    />
  );
}
