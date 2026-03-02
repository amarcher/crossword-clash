import { useEffect } from "react";
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

  useEffect(() => {
    listenForImportedPuzzle().then((puzzle) => {
      if (puzzle) {
        host.setUrlPuzzle(puzzle);
        navigate("/host/puzzle-ready", { replace: true });
      } else {
        host.setImportFailed(true);
      }
    });
  }, [host, navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
      <Title variant="dark" className="mb-6" />
      {host.importFailed ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-neutral-400 text-center">
            {t('importing.failed')}
            <br />
            {t('importing.pasteHint')}
          </p>
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
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            {t('importing.pasteButton')}
          </button>
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
