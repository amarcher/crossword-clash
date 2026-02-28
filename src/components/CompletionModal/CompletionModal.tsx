import { useTranslation } from "react-i18next";
import { Confetti } from "./Confetti";

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
  players?: PlayerResult[];
  onNewPuzzle?: () => void;
  onBackToMenu?: () => void;
  darkMode?: boolean;
}

export function CompletionModal({
  open,
  totalCells,
  totalClues,
  soloScore,
  players,
  onNewPuzzle,
  onBackToMenu,
  darkMode,
}: CompletionModalProps) {
  const { t } = useTranslation();

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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onBackToMenu}
      />

      {/* Confetti */}
      <Confetti />

      {/* Modal */}
      <div
        className={`modal-enter relative z-20 w-full max-w-md rounded-2xl ${bg} shadow-2xl p-6 sm:p-8`}
        role="dialog"
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
            <p className={`text-center mb-6 ${textSub}`}>
              {t('completion.cellsFilled', { score: soloScore ?? totalCells, total: totalCells })}
            </p>
          </>
        )}

        {/* Buttons */}
        <div className="flex flex-col gap-2">
          {onNewPuzzle && (
            <button
              onClick={onNewPuzzle}
              className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              {t('completion.newPuzzle')}
            </button>
          )}
          {onBackToMenu && (
            <button
              onClick={onBackToMenu}
              className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
                darkMode
                  ? "text-neutral-300 border border-neutral-600 hover:bg-neutral-700"
                  : "text-neutral-600 border border-neutral-300 hover:bg-neutral-100"
              }`}
            >
              {t('completion.backToMenu')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
