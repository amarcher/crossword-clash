import { puzzleIdentity } from "../../lib/soloStats";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayTheme } from "../../lib/dailyFeed";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChartLine, ChevronRight, Flag, Flame, Newspaper, PlayCircle, Swords, Trophy, UserRound, X, type LucideIcon } from "lucide-react";
import { buttonClass, PlusName } from "../ui";
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
import { ShareBackButton } from "./ShareBackButton";
import { RaceFriendSuggestions, SendToFriend } from "../Friends";
import { ReminderSwitch } from "../Push";
import { DAILY_FINISH_CLOSED_EVENT } from "../../lib/push";
import type { DailySlot } from "../../lib/dailyFeed";
import { BoardSignForm } from "../BoardSignForm";
import { BoardJoinPrompt } from "../BoardJoinPrompt";
import type { BoardJoin } from "../../hooks/useBoardJoin";
import { buildShareBlock, claimantLegend, MAX_ROW_WIDTH, type ShareBlock } from "../../lib/shareBlock";
import { buildPuzzleLink } from "../../lib/dailyChallenge";
import { buildChallengeUrl } from "../../lib/challenge";
import { compressPuzzleToHash } from "../../lib/puzzleUrl";
import { todayKey } from "../../lib/dailyLeaderboard";
import { track } from "../../lib/analytics";
import type { NextUpItem } from "../../lib/nextUp";
import { AdSlot } from "../AdSlot";
import type { CellState, Puzzle, PuzzleRef } from "../../types/puzzle";
import type { ChallengeComparison } from "../../lib/challenge";
import type { RaceResult } from "../../lib/race";
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
   * The shared puzzle this was, where the site can link to it (Puzzle.ref):
   * any day's daily, or a community puzzle. Its link carries the share, the
   * replay and the friend invite; without it, today's daily (`dailySlot`).
   */
  puzzleRef?: PuzzleRef;
  /**
   * Explicitly post a private daily finish, or rename an older default-name
   * entry. Sharing may rename an already posted entry, but cannot post one.
   * `signedAs` shows confirmation; `unposted` requires a separate Post action.
   */
  dailySign?: { signedAs?: string | null; onSign: (name: string) => void; unposted?: boolean };
  /**
   * A daily finish that was not sent to the board because this page is a
   * preview deployment or local dev (production and the apps post): a quiet
   * note in place of the sign form.
   */
  boardNotPosted?: boolean;
  dailyPostingNotice?: string;
  /** The finish is not on the board: the way onto it (an account, or who may watch). */
  boardJoin?: BoardJoin;
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
  /** A race against recorded solves (race.ts): the verdict against each ghost. */
  raceResults?: RaceResult[];
  /** The finished daily's replay share ID (replayShare.ts): previewed above Share, and carried by the daily link. */
  replayId?: string;
  /** The replay is being filed: the share preview holds the clip's place until `replayId` arrives. */
  replayPending?: boolean;
  /** A shared-grid race: the names of the players who hold squares, in the clip's order (roomReplayOrder). */
  raceWho?: string[];
  /**
   * After racing a shared link's sender: send them this solve back, in the
   * thread the link came from (their name, this solve's own link, the verdict).
   */
  shareBack?: ChallengeComparison & { name: string; link: string };
  /** Recorded solves of this puzzle the finisher may watch replayed, and the handler. */
  replays?: { userId: string; name: string }[];
  onWatchReplay?: (userId: string) => void;
  /** The race (friendRace.ts): friends have recorded solves of this puzzle; one button opens them all on one clock. */
  friendRace?: { count: number; name: string };
  onWatchFriendRace?: () => void;
  /** A finished shared-grid race this device can play back (roomReplay.ts): opens the room's replay. */
  onWatchRoomReplay?: () => void;
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
   * The close control, Escape and a tap outside: dismiss the dialog and stay on
   * the solved grid. Without it they leave the way "Back to menu" does.
   */
  onClose?: () => void;
  /**
   * Anonymous finisher in a build that offers accounts: a quiet "keep this
   * solve" nudge that opens the sign-in sheet. Omit for signed-in solvers and
   * wherever accounts aren't on offer, so the modal shows nothing extra.
   */
  onSignIn?: () => void;
  /** A signed-in solver's way to the Stats page (`/stats`); omit where there is no account. */
  onSeeStats?: () => void;
  darkMode?: boolean;
}

export function CompletionModal({
  open,
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
  puzzleRef,
  dailySign,
  boardNotPosted,
  dailyPostingNotice,
  boardJoin,
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
  raceResults,
  replayId,
  replayPending,
  raceWho,
  shareBack,
  replays,
  onWatchReplay,
  friendRace,
  onWatchFriendRace,
  onWatchRoomReplay,
  nextUp,
  onNextUp,
  onRaceFresh,
  puzzleSize,
  onNextPuzzle,
  onBackToMenu,
  onClose,
  onSignIn,
  onSeeStats,
  darkMode,
}: CompletionModalProps) {
  const { t, i18n } = useTranslation();
  const modalRef = useRef<HTMLDivElement | null>(null);

  const dismiss = onClose ?? onBackToMenu;
  const handleEscape = useCallback(() => {
    dismiss?.();
  }, [dismiss]);

  useFocusTrap(open ? modalRef : { current: null }, handleEscape);
  // A tap outside closes the dialog only when the press began there. The last letter is typed
  // as the finger lands on a key (PuzzleKeyboard); the dialog is up before it lifts, and a
  // phone hands that tap's click to whatever is under it by then: where the card did not cover
  // the key, that was this backdrop, and the dialog closed unseen (Andrew, 2026-11-19).
  const pressedOutside = useRef(false);
  useEffect(() => { if (!open) pressedOutside.current = false; }, [open]);

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
  // The reminder ask waits for this dialog to close, so it never competes with Share. A dialog
  // that was up for under a second was not read (and StrictMode's remount is not a close).
  useEffect(() => {
    if (!open || !dailySlot || isMultiplayer) return;
    const openedAt = Date.now();
    return () => {
      if (Date.now() - openedAt > 1000) window.dispatchEvent(new Event(DAILY_FINISH_CLOSED_EVENT));
    };
  }, [open, dailySlot, isMultiplayer]);
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
  const linkRef = useMemo<PuzzleRef | undefined>(() => puzzleRef ?? (dailySlot ? { day: todayKey(), slot: dailySlot } : undefined), [puzzleRef, dailySlot]);
  const refDaily = linkRef && "day" in linkRef ? linkRef : undefined;
  const refBonus = !!linkRef && "bonusDay" in linkRef;
  const shareDaily = refDaily ? t(SLOT_EYEBROW[refDaily.slot]) : undefined;
  const shareStreak = streakCount && streakCount > 0 ? t("soloStats.streakDays", { count: streakCount }) : undefined;

  // Who a versus room's link names: the players holding squares, in the clip's order when the room gave it.
  const sharedWho = useMemo(
    () => (!players?.length || isAsync || coop ? undefined : raceWho ?? [...players].sort((a, b) => b.cellsClaimed - a.cellsClaimed).filter((p) => p.cellsClaimed > 0).map((p) => p.displayName)),
    [players, isAsync, coop, raceWho],
  );

  // The spoiler-free result block for a given challenger name: the link
  // carries the name (and the ghost time), so it is rebuilt when one is signed.
  const blockFor = useCallback(
    (name: string): ShareBlock => {
      const puzzle = challengePuzzle as Puzzle;
      // A bonus is Plus only: its link is its day's (linkRef) or, in a room, the site, never the puzzle in a #puzzle= hash.
      // A shared grid raced by several is nobody's own solve: its link is the race's ("a vs b on …"),
      // never "<sharer> solved it in <the room's time>" (which it said of a player with no squares).
      // One player holding every square did solve it, so the time is signed with their name.
      const link = linkRef
        ? sharedWho && sharedWho.length > 1
          ? buildPuzzleLink(SHARE_URL, linkRef, { replay: replayId, race: sharedWho.length, who: sharedWho })
          : buildPuzzleLink(SHARE_URL, linkRef, { seconds: shareSeconds, name: sharedWho?.[0] ?? name, replay: replayId })
        : puzzle.origin === "bonus"
          ? `${SHARE_URL}/`
          : shareSeconds !== undefined
          ? buildChallengeUrl(SHARE_URL, puzzle, { name, seconds: shareSeconds })
          : `${SHARE_URL}/${compressPuzzleToHash(puzzle)}`;
      return buildShareBlock({
        puzzle,
        cells: playerCells ?? {},
        wrongCells,
        seconds: shareSeconds,
        day: refDaily?.day,
        locale: i18n.language,
        playerColors,
        link,
        // The puzzle's own link unfurls as the result (the solve itself, with a
        // replay): it is sent alone, with no emoji rows. A puzzle carried in
        // the link's hash has only the site's card, so its block goes along.
        rows: !linkRef,
        linkOnly: !!linkRef,
        labels: {
          brand: t("completion.shareBrand"),
          daily: shareDaily,
          streak: shareStreak,
          standing: shareStanding,
          cta: shareSeconds !== undefined ? t("completion.beatMyTime") : t("completion.playIt"),
        },
      });
    },
    [challengePuzzle, linkRef, refDaily, shareSeconds, shareDaily, shareStreak, shareStanding, playerCells, wrongCells, playerColors, t, i18n.language, isMultiplayer, replayId, sharedWho],
  );

  if (!open) return null;

  const hasNextUp = !!nextUp && nextUp.length > 0 && !!onNextUp;

  const bg = darkMode ? "bg-stage-raised ring-1 ring-stage-line" : "bg-surface";
  const text = darkMode ? "text-white" : "text-ink";
  const textSub = darkMode ? "text-white/60" : "text-muted";
  const tableBg = darkMode ? "bg-white/5" : "bg-surface-sunken";
  const tableText = darkMode ? "text-white/80" : "text-ink-soft";
  const tableHeader = darkMode ? "text-white/50" : "text-subtle";

  const shareActions = (
    <div className="flex flex-col gap-2 max-md:mb-2">
          {/* One Share: the spoiler-free block (previewed above its button),
              whose link is the challenge. Needs the puzzle for the rows. */}
          {onWatchRoomReplay && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onWatchRoomReplay}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${darkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-100"}`}
              >
                <PlayCircle className="size-4" aria-hidden="true" />
                {t("roomReplay.watch")}
              </button>
            </div>
          )}
          {shareBack && <ShareBackButton {...shareBack} darkMode={darkMode} />}
          {challengePuzzle && (
            <ShareResultButton
              mode={isMultiplayer ? "multiplayer" : "solo"}
              blockFor={blockFor}
              challengerName={(challengerName ?? "").trim() || t("common.defaultPlayerName")}
              hasTime={shareSeconds !== undefined}
              puzzleSize={puzzleSize ?? `${challengePuzzle.width}x${challengePuzzle.height}`}
              daily={(!!refDaily || !!refBonus) && !isMultiplayer}
              legend={shareLegend}
              // A room's clip is shown only when the link can carry it; a time trial's is the player's own solve.
              clip={replayId && (linkRef || !isMultiplayer) ? { id: replayId, race: isMultiplayer && !isAsync } : undefined}
              clipPending={replayPending && !replayId && !!(linkRef || !isMultiplayer)}
              communityTitle={linkRef && "shortId" in linkRef ? challengePuzzle.title : undefined}
              onNameSigned={dailySign?.unposted ? undefined : dailySign?.onSign}
              darkMode={darkMode}
            />
          )}
        </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      // In the apps the dialog sits outside #root's padding, so it keeps clear of the status bar itself.
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-stage/60 backdrop-blur-[2px]"
        onPointerDown={() => { pressedOutside.current = true; }}
        onClick={() => {
          if (!pressedOutside.current) return;
          pressedOutside.current = false;
          dismiss?.();
        }}
      />

      {/* Confetti — mounted only during the one-shot celebration window */}
      {celebrating && <Confetti />}

      {/* Modal */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`modal-enter scroll-quiet outline-none relative z-20 w-full max-w-md md:max-w-3xl max-h-[min(96dvh,100%)] overflow-y-auto overscroll-contain rounded-3xl ${bg} shadow-overlay p-5 sm:p-6`}
        role="dialog"
        aria-modal="true"
        aria-label={t('completion.ariaLabel')}
      >
        {/* The close, where a dialog's close is expected: on the play screens it
            dismisses to the solved grid (`onClose`), elsewhere it leaves. "Back to menu" at the
            foot of the list stays for readers who scroll; on a phone the modal is
            taller than the screen, so a reader who only wanted out had to find it
            there or hit the sliver of backdrop. */}
        {dismiss && (
          <button
            type="button"
            onClick={dismiss}
            aria-label={t('completion.close')}
            className={`absolute right-3 top-3 grid size-11 place-items-center rounded-xl focus-visible:outline-2 focus-visible:outline-brand-500 ${
              darkMode ? "text-white/60 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-surface-sunken hover:text-ink"
            }`}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        )}

        {/* Trophy and title share a line: the dialog is meant to fit a screen without scrolling (Andrew, 2026-11-20). */}
        <div className={`flex items-center justify-center gap-3 ${isMultiplayer ? "mb-1" : "mb-3"}`}>
          <span className={`trophy-pulse grid size-10 shrink-0 place-items-center rounded-full ${darkMode ? "bg-gold-500/15" : "bg-gold-50 ring-1 ring-gold-100"}`}>
            <Trophy className="size-5 text-gold-500" strokeWidth={2} aria-hidden="true" />
          </span>
          <h2 className={`font-display text-2xl font-bold tracking-tight ${text}`}>
            {t('completion.puzzleComplete')}
          </h2>
        </div>

        {isMultiplayer && (
          <>
          {/* Outcome line: async → fastest finisher (or waiting), co-op →
              team finish, versus → most squares solved (the line says so:
              players asked whether it was squares or clues — it is squares). */}
          <p className={`text-center mb-4 ${textSub}`}>
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
          </>
        )}

        {/* From md up the dialog is two columns, the result and its Share beside what to do next, so it
            fits a laptop screen without scrolling; a phone keeps one column in the same order. */}
        <div className="md:grid md:grid-cols-2 md:items-start md:gap-x-6 md:[&:has(>div:nth-child(2):empty)]:grid-cols-1">
        <div className="min-w-0">
        {isMultiplayer ? (
          <>
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
                            <span className="font-medium truncate">
                              <PlusName userId={row.userId}>{row.displayName}</PlusName>
                            </span>
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
                              <PlusName userId={player.userId}>{player.displayName}</PlusName>
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
            {/* Solo stats: the count of squares only when it says something (a finish short of the grid). */}
            {soloScore !== undefined && soloScore < totalCells && (
              <p className={`text-center mb-4 ${textSub}`}>
                {t('completion.cellsFilled', { score: soloScore, total: totalCells })}
              </p>
            )}

            {(() => {
              // Celebrate only a genuine record — beating a time that was
              // already on record. The first-ever solve is a best-of-one, not
              // an achievement, so it reads as a plain "your time".
              const celebrateBest = !assisted && isNewBest === true && previousBest != null;
              const hasStreak = streakCount !== undefined && streakCount > 0;
              if (finishSeconds === undefined && !hasStreak) return null;
              const tile = "rounded-xl px-3 py-2 text-center";
              // The time and the streak sit side by side, each a tile; one alone takes the row.
              return (
                <div className="mb-3 grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">
                  {finishSeconds !== undefined && (
                    <div
                      className={`${tile} ${
                        celebrateBest
                          ? darkMode
                            ? "bg-gold-500/15 ring-1 ring-gold-500/40"
                            : "bg-gold-50 ring-1 ring-gold-100"
                          : tableBg
                      }`}
                    >
                      <div className={`font-display text-3xl font-bold tracking-tight tabular-nums ${text}`}>
                        {formatDuration(finishSeconds)}
                      </div>
                      <div
                        className={`mt-0.5 text-xs font-medium text-balance ${
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
                  )}
                  {hasStreak && (
                    <div className={`${tile} ${tableBg}`} aria-label={t('soloStats.streakDays', { count: streakCount })}>
                      <div className={`flex items-center justify-center gap-1.5 font-display text-3xl font-bold tracking-tight tabular-nums ${text}`} aria-hidden="true">
                        <Flame className="size-6 text-gold-500" />
                        {streakCount}
                      </div>
                      <div className={`mt-0.5 text-xs font-medium ${darkMode ? "text-gold-400" : "text-gold-700"}`} aria-hidden="true">
                        {t('soloStats.streakLabel', { count: streakCount })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
                unposted={dailySign.unposted}
                onSign={dailySign.onSign}
                darkMode={darkMode}
                className="mb-5"
              />
            )}
            {boardJoin && <BoardJoinPrompt join={boardJoin} darkMode={darkMode} className="mb-5" />}
            {dailyPostingNotice && <p role="status" className={`mb-5 text-center text-sm ${darkMode ? "text-white/70" : "text-muted"}`}>{dailyPostingNotice}</p>}

            {boardNotPosted && (
              <p data-testid="board-not-posted" className={`mb-5 text-center text-xs ${darkMode ? "text-white/50" : "text-muted"}`}>
                {t("leaderboard.notPosted")}
              </p>
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

            {raceResults && raceResults.length > 0 && (
              <ul data-testid="race-results" aria-label={t("ghostRace.resultsLabel")} className={`mb-4 flex flex-col gap-1.5 rounded-xl px-4 py-3 text-sm font-semibold ${darkMode ? "bg-white/5 text-white/90" : "bg-surface-sunken text-ink"}`}>
                {raceResults.map((r) => (
                  <li key={r.name} className="flex items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden="true" />
                    <span className={r.outcome === "beat" ? (darkMode ? "text-emerald-300" : "text-emerald-700") : r.outcome === "lost" ? (darkMode ? "text-rose-300" : "text-rose-700") : ""}>
                      {r.outcome === "beat"
                        ? t("challenge.resultBeat", { name: r.name, delta: formatDuration(r.deltaSeconds) })
                        : r.outcome === "lost"
                          ? t("challenge.resultLost", { name: r.name, delta: formatDuration(r.deltaSeconds) })
                          : t("challenge.resultTied", { name: r.name })}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {((replays && replays.length > 0 && onWatchReplay) || (friendRace && onWatchFriendRace)) && (
              <div className="mb-5 flex flex-wrap justify-center gap-2" data-testid="race-replays">
                {friendRace && onWatchFriendRace && (
                  <button
                    type="button"
                    data-testid="friend-race"
                    onClick={onWatchFriendRace}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${darkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-100"}`}
                  >
                    <Flag className="size-4" aria-hidden="true" />
                    {t("friendRace.openYours", friendRace)}
                  </button>
                )}
                {onWatchReplay && replays?.map((r) => (
                  <button
                    key={r.userId}
                    type="button"
                    onClick={() => onWatchReplay(r.userId)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${darkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-100"}`}
                  >
                    <PlayCircle className="size-4" aria-hidden="true" />
                    {t("ghostRace.watchVs", { name: r.name })}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* One way to an account per finish: the board's own button stands in for this card. */}
        {onSignIn && boardJoin?.kind !== "account" && (
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
            block previewed above it and its link the challenge; then the board;
            then "Up next" and the fresh-puzzle race; "Back
            to menu" is the quiet exit. The importer is never offered here —
            the game header keeps "Load different puzzle". */}
        {!isMultiplayer && shareActions}
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {/* A room: the standings fill the first column, so the replay and its Share lead the second. */}
          {isMultiplayer && shareActions}
          {/* A finish of a linkable puzzle (any daily, a community puzzle) with friends: the race-my-solve link delivered in-app
              (docs/friends-spec.md §3.2). Renders nothing without friends. */}
          {/* The apps, after a daily: the reminder switch in context (docs/friends-spec.md §3.3). */}
          {dailySlot && !isMultiplayer && <ReminderSwitch darkMode={darkMode} />}
          {linkRef && !isMultiplayer && shareSeconds !== undefined && (
            <SendToFriend
              link={buildPuzzleLink("", linkRef, { seconds: shareSeconds, name: (challengerName ?? "").trim() || t("common.defaultPlayerName"), replay: replayId })}
              puzzleKey={challengePuzzle ? puzzleIdentity(challengePuzzle) : null}
              darkMode={darkMode}
            />
          )}
          {(onViewLeaderboard || onSeeStats) && (
            <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
              {onViewLeaderboard && (
                <button onClick={onViewLeaderboard} className={buttonClass(darkMode ? "stage" : "secondary", "md", "w-full")}>
                  <Trophy className="size-4 text-gold-500" aria-hidden="true" />
                  {t('completion.viewLeaderboard')}
                </button>
              )}
              {onSeeStats && (
                <button onClick={onSeeStats} className={buttonClass(darkMode ? "stage" : "secondary", "md", "w-full")}>
                  <ChartLine className="size-4" aria-hidden="true" />
                  {t('completion.seeStats')}
                </button>
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
                onClick={onNextPuzzle}
                darkMode={darkMode}
              />
            </RowGroup>
          )}
          {/* After a race: the room's other accounts as "Add friend" rows
              (Raced with you), below the next-puzzle row and above the quiet
              exit. Nothing for a spectator (no viewer id), an anonymous
              viewer or with the switch off. */}
          {isMultiplayer && players && currentUserId && <RaceFriendSuggestions players={players} viewerId={currentUserId} darkMode={darkMode} />}

          {onBackToMenu && (
            <button onClick={onBackToMenu} className={buttonClass("ghost", "md", `w-full ${darkMode ? "text-white/60 hover:text-white hover:bg-white/10" : ""}`)}>
              {t('completion.backToMenu')}
            </button>
          )}
        </div>
        </div>

        {/* Ad */}
        <div className="mt-4 flex justify-center empty:hidden">
          <AdSlot placement="completion-footer" darkMode={darkMode} />
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
      className={`group flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 ${
        darkMode ? "hover:bg-white/5 active:bg-white/10" : "hover:bg-surface-sunken/70 active:bg-surface-sunken"
      }`}
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${ROW_TONES[tone][darkMode ? "dark" : "light"]}`}>
        <Icon className="size-4" strokeWidth={2} aria-hidden="true" />
      </span>
      {/* One line: the title, then its detail in the room that is left (the dialog fits a screen, Andrew 2026-11-20). */}
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className={`shrink-0 text-sm font-semibold leading-snug ${darkMode ? "text-white" : "text-ink"}`}>{title}</span>
        {subtitle && <span className={`min-w-0 truncate text-xs leading-snug ${darkMode ? "text-white/60" : "text-muted"}`}>{subtitle}</span>}
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
