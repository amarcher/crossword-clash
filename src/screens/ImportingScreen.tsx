import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../components/Title";
import { useGame } from "../contexts/GameContext";
import { listenForImportedPuzzle, readPuzzleFromClipboard } from "../lib/puzzleUrl";
import { tStatic } from "../i18n/i18n";

export function ImportingScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const game = useGame();

  useEffect(() => {
    listenForImportedPuzzle().then((puzzle) => {
      if (puzzle) {
        game.setUrlPuzzle(puzzle);
        navigate("/puzzle-ready", { replace: true });
      } else {
        game.setImportFailed(true);
      }
    });
  }, [game, navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
      <Title className="mb-6" />
      {game.importFailed ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-neutral-600 text-center">
            {t('importing.failed')}
            <br />
            {t('importing.pasteHint')}
          </p>
          <button
            onClick={async () => {
              const puzzle = await readPuzzleFromClipboard();
              if (puzzle) {
                game.setUrlPuzzle(puzzle);
                navigate("/puzzle-ready");
              } else {
                alert(tStatic('importing.pasteError'));
              }
            }}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            {t('importing.pasteButton')}
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            {t('importing.backToMenu')}
          </button>
        </div>
      ) : (
        <p className="text-neutral-500">{t('importing.receiving')}</p>
      )}
    </div>
  );
}
