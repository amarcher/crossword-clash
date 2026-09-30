import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { TVScreen } from "../../components/Layout/TVScreen";
import { buttonClass } from "../../components/ui";
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
    <TVScreen>
      <div className="max-w-[40em]">
        <h1 className="tv-t-2xl font-display font-bold text-white">{urlPuzzle.title}</h1>
        {urlPuzzle.author && <p className="tv-t-lg mt-2 text-slate-300">{t('puzzleReady.by', { author: urlPuzzle.author })}</p>}
        <p className="tv-t-md mt-2 text-slate-400">
          {t('puzzleReady.dimensions', { width: urlPuzzle.width, height: urlPuzzle.height, acrossCount, downCount })}
        </p>
      </div>
      {user ? (
        <button onClick={() => handlePuzzleLoaded(urlPuzzle)} className={buttonClass("primary", "lg", "tv-t-lg h-auto! px-10 py-4")}>
          {t('puzzleReady.hostGame')}
          <ArrowRight className="size-[1.1em]" aria-hidden />
        </button>
      ) : (
        <p role="status" className="tv-t-md text-slate-400">{t('puzzleReady.connecting')}</p>
      )}
    </TVScreen>
  );
}
