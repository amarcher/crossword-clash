import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../../components/Title";
import { useHostContext } from "../../layouts/HostLayout";
import { listenForImportedPuzzle, readPuzzleFromClipboard } from "../../lib/puzzleUrl";
import { tStatic } from "../../i18n/i18n";

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
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
      <Title variant="dark" className="mb-6" />
      {host.importFailed ? (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <p className="text-neutral-400 text-center">{t('importing.failed')}</p>
          <p className="text-sm text-neutral-500 text-center -mt-2">{t('importing.failedReason')}</p>
          <button
            onClick={attemptImport}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors w-full"
          >
            {t('importing.tryAgain')}
          </button>
          <p className="text-xs text-neutral-500 text-center">{t('importing.pasteHint')}</p>
          <button
            onClick={async () => {
              const puzzle = await readPuzzleFromClipboard();
              if (puzzle) {
                host.setUrlPuzzle(puzzle);
                navigate("/host/puzzle-ready");
              } else {
                alert(tStatic('importing.pasteError'));
              }
            }}
            className="px-6 py-3 rounded-lg font-semibold text-blue-400 border-2 border-blue-400 hover:bg-neutral-800 transition-colors w-full"
          >
            {t('importing.pasteButton')}
          </button>
          <p className="text-xs text-neutral-500 text-center">{t('importing.retryHint')}</p>
          <button
            onClick={() => navigate("/host")}
            className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            {t('importing.backToMenu')}
          </button>
        </div>
      ) : (
        <p className="text-neutral-400">{t('importing.receiving')}</p>
      )}
    </div>
  );
}
