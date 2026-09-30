import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ClipboardPaste, Loader2, RotateCw } from "lucide-react";
import { TVScreen } from "../../components/Layout/TVScreen";
import { buttonClass } from "../../components/ui";
import { useHostContext } from "../../layouts/HostLayout";
import { listenForImportedPuzzle, readPuzzleFromClipboard } from "../../lib/puzzleUrl";
import { emitToast } from "../../lib/toastBus";

export function HostImportingScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const host = useHostContext();

  // The opening tab (the NYT page) keeps its postMessage listener alive for
  // ~30s after the bookmarklet is clicked, so retrying in-place (no need to
  // switch tabs) succeeds for the common case: a slow connection or a
  // cold-started page that took longer than our own listen window.
  const attemptImport = useCallback(() => {
    host.setImportFailed(false);
    listenForImportedPuzzle().then((puzzle) => {
      if (puzzle) {
        host.setUrlPuzzle(puzzle);
        navigate("/host/puzzle-ready", { replace: true });
      } else {
        host.setImportFailed(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    attemptImport();
    // Only run once on mount — attemptImport is re-invoked explicitly by
    // the "Try Again" button, not by effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TVScreen>
      {host.importFailed ? (
        <div className="flex w-full max-w-[32em] flex-col items-center gap-4">
          <p className="tv-t-lg text-slate-100">{t('importing.failed')}</p>
          <p className="tv-t-md text-slate-400">{t('importing.failedReason')}</p>
          <button onClick={attemptImport} className={buttonClass("primary", "lg", "tv-t-md w-full")}>
            <RotateCw className="size-5" aria-hidden />
            {t('importing.tryAgain')}
          </button>
          <p className="tv-t-sm text-slate-400">{t('importing.pasteHint')}</p>
          <button
            onClick={async () => {
              const puzzle = await readPuzzleFromClipboard();
              if (puzzle) {
                host.setUrlPuzzle(puzzle);
                navigate("/host/puzzle-ready");
              } else {
                emitToast({ message: t('importing.pasteError'), severity: 'error', ttl: 8000 });
              }
            }}
            className={buttonClass("stage", "lg", "tv-t-md w-full")}
          >
            <ClipboardPaste className="size-5" aria-hidden />
            {t('importing.pasteButton')}
          </button>
          <p className="tv-t-sm text-slate-400">{t('importing.retryHint')}</p>
          <button onClick={() => navigate("/host")} className="tv-t-md min-h-11 rounded-xl px-4 text-slate-300 transition-colors hover:bg-stage-raised hover:text-white active:bg-stage-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
            {t('importing.backToMenu')}
          </button>
        </div>
      ) : (
        <p role="status" className="tv-t-lg flex items-center gap-3 text-slate-300">
          <Loader2 className="size-[1.2em] animate-spin motion-reduce:animate-none" aria-hidden />
          {t('importing.receiving')}
        </p>
      )}
    </TVScreen>
  );
}
