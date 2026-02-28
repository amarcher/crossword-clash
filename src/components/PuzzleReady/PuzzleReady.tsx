import { useTranslation } from "react-i18next";
import { Title } from "../Title";
import type { Puzzle } from "../../types/puzzle";

interface PuzzleReadyProps {
  puzzle: Puzzle;
  onPlaySolo: () => void;
  onHostGame: () => void;
  onHostOnTV: () => void;
  /** When false, only show Play Solo (e.g. no Supabase connection) */
  showHostOptions: boolean;
  /** Dark theme variant for HostApp */
  darkMode?: boolean;
}

export function PuzzleReady({
  puzzle,
  onPlaySolo,
  onHostGame,
  onHostOnTV,
  showHostOptions,
  darkMode = false,
}: PuzzleReadyProps) {
  const { t } = useTranslation();
  const acrossCount = puzzle.clues.filter((c) => c.direction === "across").length;
  const downCount = puzzle.clues.filter((c) => c.direction === "down").length;

  const bg = darkMode ? "bg-neutral-900" : "bg-neutral-50";
  const subtitleColor = darkMode ? "text-neutral-400" : "text-neutral-500";
  const metaColor = darkMode ? "text-neutral-300" : "text-neutral-700";

  return (
    <div className={`flex flex-col items-center justify-center h-dvh ${bg} p-8`}>
      <Title variant={darkMode ? "dark" : "light"} className="mb-6" />

      <div className="text-center mb-6">
        <h2 className={`text-xl font-bold ${metaColor}`}>{puzzle.title}</h2>
        {puzzle.author && (
          <p className={`text-sm ${subtitleColor} mt-1`}>{t('puzzleReady.by', { author: puzzle.author })}</p>
        )}
        <p className={`text-sm ${subtitleColor} mt-2`}>
          {t('puzzleReady.dimensions', { width: puzzle.width, height: puzzle.height, acrossCount, downCount })}
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {showHostOptions && (
          <>
            <button
              onClick={onHostGame}
              className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              {t('menu.hostAsPlayer')}
            </button>
            <button
              onClick={onHostOnTV}
              className="px-6 py-3 rounded-lg font-semibold text-blue-600 border-2 border-blue-600 hover:bg-blue-50 transition-colors"
            >
              {t('menu.hostAsTV')}
            </button>
          </>
        )}
        <button
          onClick={onPlaySolo}
          className="px-6 py-3 rounded-lg font-semibold text-neutral-600 border-2 border-neutral-300 hover:bg-neutral-100 transition-colors"
        >
          {t('menu.playSolo')}
        </button>
      </div>
    </div>
  );
}
