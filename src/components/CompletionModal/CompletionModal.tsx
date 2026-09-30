import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Flame, Newspaper, Trophy } from "lucide-react";
import { buttonClass } from "../ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import {
  isFreshCompletion,
  prefersReducedMotion,
  CONFETTI_DURATION_MS,
} from "../../lib/celebration";
import { playWinSound } from "../../lib/winSound";
import { computeViewerStanding } from "../../lib/resultCard";
import { Confetti } from "./Confetti";
import { ShareResultButton } from "./ShareResultButton";
import { ChallengeFriendButton } from "./ChallengeFriendButton";
import { LeaderboardSignForm } from "./LeaderboardSignForm";
import { PlayLiveButton } from "./PlayLiveButton";
import { AdSlot } from "../AdSlot";
import { NytRecommendation } from "../NytRecommendation";
import type { Puzzle } from "../../types/puzzle";
import type { ChallengeComparison } from "../../lib/challenge";
import type { RaceStandingRow } from "../../lib/raceResults";

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
   * The full puzzle, used to build a "Challenge a friend" link (solo path). The
   * button is shown only when a puzzle and a finish time are both present.
   */
  challengePuzzle?: Puzzle;
  /** The finisher's display name, embedded as the challenger in the link. */
  challengerName?: string;
  /**
   * When the finisher was themselves racing an incoming challenge, the verdict
   * against the challenger's ghost — drives the personal outcome banner.
   */
  challengeOutcome?: ChallengeComparison & { challengerName: string };
  /**
   * Bridge into a FAIR live rematch: when provided, a "Play Live" / "Rematch
   * Live" CTA funnels the finisher into the existing host-as-player flow on a
   * FRESH puzzle. Passed only when multiplayer is actually available (Supabase
   * configured + anonymous auth); absent → the CTA is hidden entirely.
   */
  onPlayLive?: () => void;
  /** Puzzle size (e.g. "15x15") for the live-bridge analytics dimension. */
  puzzleSize?: string;
  onNewPuzzle?: () => void;
  onRematch?: () => void;
  onBackToMenu?: () => void;
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
  streakCount,
  nytHook,
  raceSeconds,
  onViewLeaderboard,
  dailySign,
  raceStandings,
  coop,
  players,
  currentUserId,
  challengePuzzle,
  challengerName,
  challengeOutcome,
  onPlayLive,
  puzzleSize,
  onNewPuzzle,
  onRematch,
  onBackToMenu,
  darkMode,
}: CompletionModalProps) {
  const { t } = useTranslation();
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

  if (!open) return null;

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
        className={`modal-enter relative z-20 w-full max-w-md max-h-[90dvh] overflow-y-auto overscroll-contain rounded-3xl ${bg} shadow-overlay p-6 sm:p-8`}
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
                team finish, versus → most cells claimed. */}
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
                    ? t('completion.tie')
                    : t('completion.wins', { name: winner.displayName })}
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
                      <th className="text-right py-2 px-3">{t('completion.cells')}</th>
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
              const celebrateBest = isNewBest === true && previousBest != null;
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
                    {celebrateBest
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
              <LeaderboardSignForm
                signedAs={dailySign.signedAs}
                onSign={dailySign.onSign}
                darkMode={darkMode}
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

        {/* Actions: exactly one primary (Rematch › New puzzle), then a grid of
            secondary share/next-step actions, then a quiet way out. */}
        <div className="flex flex-col gap-2.5">
          {onRematch && (
            <button onClick={onRematch} className={buttonClass("primary", "lg", "w-full")} autoFocus>
              {t('completion.playAgain')}
            </button>
          )}
          {onNewPuzzle && (
            <button
              onClick={onNewPuzzle}
              className={buttonClass(onRematch ? (darkMode ? "stage" : "secondary") : "primary", "lg", "w-full")}
              autoFocus={!onRematch}
            >
              {t('completion.newPuzzle')}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">
            <ShareResultButton
              mode={isMultiplayer ? "multiplayer" : "solo"}
              puzzleTitle={puzzleTitle}
              finishSeconds={finishSeconds ?? raceSeconds ?? undefined}
              bestSeconds={bestSeconds}
              isNewBest={isNewBest}
              winnerName={isAsync ? asyncWinner?.displayName : winner?.displayName}
              isTie={isAsync ? asyncTie : isTie}
              coop={coop}
              viewerStanding={viewerStanding ?? undefined}
              darkMode={darkMode}
            />
            {!isMultiplayer && challengePuzzle && finishSeconds !== undefined && (
              <ChallengeFriendButton
                puzzle={challengePuzzle}
                challengerName={(challengerName ?? "").trim() || t("common.defaultPlayerName")}
                finishSeconds={finishSeconds}
                onNameSigned={dailySign?.onSign}
                darkMode={darkMode}
              />
            )}
            {onViewLeaderboard && (
              <button onClick={onViewLeaderboard} className={buttonClass(darkMode ? "stage" : "secondary", "md", "w-full")}>
                <Trophy className="size-4 text-gold-500" aria-hidden="true" />
                {t('completion.viewLeaderboard')}
              </button>
            )}
            {onPlayLive && (
              <PlayLiveButton
                onPlayLive={onPlayLive}
                intent={challengeOutcome ? "rematch" : "solo"}
                size={puzzleSize}
                darkMode={darkMode}
              />
            )}
          </div>
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
