import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ClipboardPaste, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { Button, Card } from "../components/ui";
import { FlowPage } from "../components/Flow";
import { useGame } from "../contexts/GameContext";
import { listenForImportedPuzzle, readPuzzleFromClipboard } from "../lib/puzzleUrl";
import { emitToast } from "../lib/toastBus";

export function ImportingScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const game = useGame();

  // The opening tab (the NYT page) keeps its postMessage listener alive for
  // ~30s after the bookmarklet is clicked, so retrying in-place (no need to
  // switch tabs) succeeds for the common case: a slow connection or a
  // cold-started page that took longer than our own listen window.
  const attemptImport = useCallback(() => {
    game.setImportFailed(false);
    listenForImportedPuzzle().then((puzzle) => {
      if (puzzle) {
        game.setUrlPuzzle(puzzle);
        navigate("/puzzle-ready", { replace: true });
      } else {
        game.setImportFailed(true);
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

  if (!game.importFailed) {
    return (
      <div className="grid min-h-dvh place-items-center crossword-bg p-6">
        <div className="flex flex-col items-center gap-4 text-center" role="status">
          <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <Loader2 className="size-7 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          </span>
          <p className="font-display text-xl font-bold text-ink">{t('importing.receiving')}</p>
        </div>
      </div>
    );
  }

  return (
    <FlowPage title={t('importing.failed')} subtitle={t('importing.failedReason')} onBack={() => navigate("/")} backLabel={t('importing.backToMenu')}>
      <div className="grid gap-4">
        <Card className="grid gap-3 p-5">
          <Button size="lg" block onClick={attemptImport}>
            <RotateCw className="size-4.5" aria-hidden="true" />
            {t('importing.tryAgain')}
          </Button>
          <p className="text-sm text-muted">{t('importing.pasteHint')}</p>
          <Button
            variant="secondary"
            size="lg"
            block
            onClick={async () => {
              const puzzle = await readPuzzleFromClipboard();
              if (puzzle) {
                game.setUrlPuzzle(puzzle);
                navigate("/puzzle-ready");
              } else {
                emitToast({ message: t('importing.pasteError'), severity: 'error', ttl: 8000 });
              }
            }}
          >
            <ClipboardPaste className="size-4.5" aria-hidden="true" />
            {t('importing.pasteButton')}
          </Button>
        </Card>
        <p className="flex items-start gap-2.5 px-1 text-sm text-muted">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-gold-500" aria-hidden="true" />
          {t('importing.retryHint')}
        </p>
        <Button variant="ghost" block onClick={() => navigate("/")}>
          {t('importing.backToMenu')}
        </Button>
      </div>
    </FlowPage>
  );
}
