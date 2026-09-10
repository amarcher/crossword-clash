import { useTranslation } from "react-i18next";
import { Title } from "../Title";
import { AdSlot } from "../AdSlot";
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
  /**
   * Current NYT-bookmarklet streak in days. Only shown for a puzzle whose
   * origin is the bookmarklet; 0 hides the streak line.
   */
  nytStreak?: number;
}

export function PuzzleReady({
  puzzle,
  onPlaySolo,
  onHostGame,
  onHostOnTV,
  showHostOptions,
  darkMode = false,
  nytStreak = 0,
}: PuzzleReadyProps) {
  const { t } = useTranslation();
  const acrossCount = puzzle.clues.filter((c) => c.direction === "across").length;
  const downCount = puzzle.clues.filter((c) => c.direction === "down").length;
  const fromNyt = puzzle.origin === "nyt-bookmarklet";

  const bg = darkMode ? "bg-neutral-900" : "crossword-bg";
  const subtitleColor = darkMode ? "text-neutral-400" : "text-neutral-500";
  const metaColor = darkMode ? "text-neutral-300" : "text-neutral-700";
  const badgeClass = darkMode
    ? "bg-emerald-950 border-emerald-800 text-emerald-400"
    : "bg-emerald-50 border-emerald-200 text-emerald-700";
  const buttonSubtitleClass = darkMode ? "text-neutral-500" : "text-neutral-400";

  return (
    <div className={`flex flex-col items-center justify-center h-dvh ${bg} p-8`}>
      <Title variant={darkMode ? "dark" : "light"} className="mb-4" />

      {/* First thing a bookmarklet import shows — confirm success explicitly
          rather than silently landing on a puzzle summary. */}
      <div
        className={`mb-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6.5L4.5 9L10 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {fromNyt ? t('puzzleReady.importedFromNyt') : t('puzzleReady.importedBadge')}
      </div>

      <div className="text-center mb-6">
        <h2 className={`text-xl font-bold ${metaColor}`}>{puzzle.title}</h2>
        {puzzle.author && (
          <p className={`text-sm ${subtitleColor} mt-1`}>{t('puzzleReady.by', { author: puzzle.author })}</p>
        )}
        <p className={`text-sm ${subtitleColor} mt-2`}>
          {t('puzzleReady.dimensions', { width: puzzle.width, height: puzzle.height, acrossCount, downCount })}
        </p>
        {/* The bookmarklet's return loop starts here: the first import is the
            moment to say "this works every day", before they've even played. */}
        {fromNyt && (
          <p className={`text-xs ${subtitleColor} mt-3 max-w-xs mx-auto leading-snug`}>
            🗞️ {t('puzzleReady.nytTomorrow')}
            {nytStreak > 0 && (
              <>
                {' '}
                <span className={darkMode ? "text-amber-400 font-semibold" : "text-amber-700 font-semibold"}>
                  {t('puzzleReady.nytStreak', { count: nytStreak })}
                </span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        {showHostOptions && (
          <>
            <button
              onClick={onHostGame}
              className={`px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${darkMode ? "focus-visible:ring-offset-neutral-900" : ""}`}
            >
              <span className="block leading-tight">{t('menu.hostAsPlayer')}</span>
              <span className={`block text-xs font-normal mt-0.5 ${darkMode ? "text-blue-100/80" : "text-blue-50/90"}`}>
                {t('menu.hostAsPlayerSubtitle')}
              </span>
            </button>
            <button
              onClick={onHostOnTV}
              className={`px-6 py-3 rounded-lg font-semibold text-blue-600 border-2 border-blue-600 hover:bg-blue-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${darkMode ? "focus-visible:ring-offset-neutral-900" : ""}`}
            >
              <span className="block leading-tight">{t('menu.hostAsTV')}</span>
              <span className={`block text-xs font-normal mt-0.5 ${buttonSubtitleClass}`}>
                {t('menu.hostAsTVSubtitle')}
              </span>
            </button>
          </>
        )}
        <button
          onClick={onPlaySolo}
          className={`px-6 py-3 rounded-lg font-semibold text-neutral-600 border-2 border-neutral-300 hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${darkMode ? "focus-visible:ring-offset-neutral-900" : ""}`}
        >
          <span className="block leading-tight">{t('menu.playSolo')}</span>
          <span className={`block text-xs font-normal mt-0.5 ${buttonSubtitleClass}`}>
            {t('menu.playSoloSubtitle')}
          </span>
        </button>
      </div>
      <div className="mt-4">
        <AdSlot placement="puzzle-ready-bottom" darkMode={darkMode} />
      </div>
    </div>
  );
}
