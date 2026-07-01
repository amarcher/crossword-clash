import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatDuration } from "../../lib/soloStats";
import { Confetti } from "./Confetti";
import { ShareResultButton } from "./ShareResultButton";
import { AdSlot } from "../AdSlot";
import { NytRecommendation } from "../NytRecommendation";

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
  players?: PlayerResult[];
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
  players,
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

  if (!open) return null;

  const isMultiplayer = players && players.length > 0;
  const ranked = isMultiplayer
    ? [...players].sort((a, b) => b.cellsClaimed - a.cellsClaimed)
    : [];

  const winner = ranked[0];
  const isTie =
    ranked.length > 1 && ranked[0].cellsClaimed === ranked[1].cellsClaimed;

  const bg = darkMode ? "bg-neutral-800" : "bg-white";
  const text = darkMode ? "text-white" : "text-neutral-900";
  const textSub = darkMode ? "text-neutral-400" : "text-neutral-500";
  const tableBg = darkMode ? "bg-neutral-700/50" : "bg-neutral-50";
  const tableText = darkMode ? "text-neutral-300" : "text-neutral-600";
  const tableHeader = darkMode ? "text-neutral-400" : "text-neutral-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onBackToMenu}
      />

      {/* Confetti */}
      <Confetti />

      {/* Modal */}
      <div
        ref={modalRef}
        className={`modal-enter relative z-20 w-full max-w-md rounded-2xl ${bg} shadow-2xl p-6 sm:p-8`}
        role="dialog"
        aria-modal="true"
        aria-label={t('completion.ariaLabel')}
      >
        {/* Trophy */}
        <div className="text-center mb-4">
          <span className="trophy-pulse inline-block text-5xl" role="img" aria-label="trophy">
            🏆
          </span>
        </div>

        {/* Title */}
        <h2 className={`text-2xl font-bold text-center mb-1 ${text}`}>
          {t('completion.puzzleComplete')}
        </h2>

        {isMultiplayer ? (
          <>
            {/* Winner announcement */}
            <p className={`text-center mb-5 ${textSub}`}>
              {isTie
                ? t('completion.tie')
                : t('completion.wins', { name: winner.displayName })}
            </p>

            {/* Player table */}
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
                      <td className="py-2 px-3 font-medium">{i + 1}</td>
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
                        ? "bg-amber-500/15 border border-amber-500/40"
                        : "bg-amber-50 border border-amber-200"
                      : tableBg
                  }`}
                >
                  <div className={`text-3xl font-bold tabular-nums ${text}`}>
                    {formatDuration(finishSeconds)}
                  </div>
                  <div
                    className={`mt-0.5 text-sm font-medium ${
                      celebrateBest
                        ? darkMode
                          ? "text-amber-300"
                          : "text-amber-600"
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
              <p className={`text-center mb-6 text-sm font-semibold ${text}`}>
                {t('soloStats.streakDays', { count: streakCount })}
              </p>
            )}
          </>
        )}

        {/* Ad */}
        <div className="flex justify-center mb-4">
          <AdSlot placement="completion-footer" darkMode={darkMode} />
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          <ShareResultButton
            mode={isMultiplayer ? "multiplayer" : "solo"}
            puzzleTitle={puzzleTitle}
            finishSeconds={finishSeconds}
            bestSeconds={bestSeconds}
            isNewBest={isNewBest}
            winnerName={winner?.displayName}
            isTie={isTie}
            darkMode={darkMode}
          />
          {onRematch && (
            <button
              onClick={onRematch}
              className={`w-full px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${darkMode ? "focus-visible:ring-offset-neutral-800" : ""}`}
            >
              {t('completion.playAgain')}
            </button>
          )}
          {onNewPuzzle && (
            <button
              onClick={onNewPuzzle}
              className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                onRematch
                  ? darkMode
                    ? "text-white bg-neutral-700 hover:bg-neutral-600 focus-visible:ring-offset-neutral-800"
                    : "text-blue-700 bg-blue-50 hover:bg-blue-100"
                  : `text-white bg-blue-600 hover:bg-blue-700 ${darkMode ? "focus-visible:ring-offset-neutral-800" : ""}`
              }`}
            >
              {t('completion.newPuzzle')}
            </button>
          )}
          {onBackToMenu && (
            <button
              onClick={onBackToMenu}
              className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                darkMode
                  ? "text-neutral-300 border border-neutral-600 hover:bg-neutral-700 focus-visible:ring-offset-neutral-800"
                  : "text-neutral-600 border border-neutral-300 hover:bg-neutral-100"
              }`}
            >
              {t('completion.backToMenu')}
            </button>
          )}
        </div>

        {/* NYT affiliate */}
        <div className="mt-4">
          <NytRecommendation variant="inline" darkMode={darkMode} />
        </div>
      </div>
    </div>
  );
}
