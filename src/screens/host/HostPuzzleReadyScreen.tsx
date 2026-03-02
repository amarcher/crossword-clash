import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../../components/Title";
import { useHostContext } from "../../layouts/HostLayout";

export function HostPuzzleReadyScreen() {
  const { t } = useTranslation();
  const host = useHostContext();
  const { urlPuzzle, user, handlePuzzleLoaded } = host;

  if (!urlPuzzle) {
    return <Navigate to="/host" replace />;
  }

  const acrossCount = urlPuzzle.clues.filter((c) => c.direction === "across").length;
  const downCount = urlPuzzle.clues.filter((c) => c.direction === "down").length;

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
      <Title variant="dark" className="mb-6" />
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-neutral-300">{urlPuzzle.title}</h2>
        {urlPuzzle.author && (
          <p className="text-sm text-neutral-400 mt-1">{t('puzzleReady.by', { author: urlPuzzle.author })}</p>
        )}
        <p className="text-sm text-neutral-400 mt-2">
          {t('puzzleReady.dimensions', { width: urlPuzzle.width, height: urlPuzzle.height, acrossCount, downCount })}
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {user ? (
          <button
            onClick={() => handlePuzzleLoaded(urlPuzzle)}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            {t('puzzleReady.hostGame')}
          </button>
        ) : (
          <p className="text-neutral-500 text-center text-sm">
            {t('puzzleReady.connecting')}
          </p>
        )}
      </div>
    </div>
  );
}
