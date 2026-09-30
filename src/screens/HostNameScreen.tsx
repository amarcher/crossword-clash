import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { FlowPage, TextField } from "../components/Flow";
import { Button, Card, Eyebrow, MiniGridThumb } from "../components/ui";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import {
  uploadPuzzle,
  createGame,
  createNextGame,
} from "../lib/puzzleService";
import { clearMpSession } from "../lib/sessionPersistence";
import { savePlayerName } from "../lib/playerName";
import { tStatic } from "../i18n/i18n";

export function HostNameScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const game = useGame();
  const mp = useMultiplayerContext();

  const handleReset = useCallback(() => {
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/");
  }, [game, navigate]);

  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async () => {
      if (!game.displayName.trim()) return;
      // Remember the name so future dailies/challenges never ask again.
      savePlayerName(game.displayName);

      // If there's a URL puzzle, handle it directly (create game from it)
      if (game.urlPuzzle) {
        game.loadPuzzle(game.urlPuzzle);

        if (!user) return;
        const puzzleId = await uploadPuzzle(game.urlPuzzle);
        if (!puzzleId) return;

        if (mp.shareCode) {
          const result = await createNextGame(puzzleId, user.id, mp.shareCode, {
            displayName: game.displayName.trim() || tStatic('common.defaultPlayerName'),
          });
          if (result) {
            mp.broadcastNewGame(result.gameId);
            game.setGameId(result.gameId);
            game.setCompletionModalDismissed(false);
            // Consumed — a stale urlPuzzle must not hijack later "/" visits.
            game.setUrlPuzzle(null);
            navigate(`/lobby/${result.gameId}`);
            return;
          }
        }

        const result = await createGame(puzzleId, user.id, {
          multiplayer: true,
          displayName: game.displayName.trim() || tStatic('common.defaultPlayerName'),
        });
        if (result) {
          game.setGameId(result.gameId);
          game.setIsMultiplayer(true);
          // Consumed — a stale urlPuzzle must not hijack later "/" visits.
          game.setUrlPuzzle(null);
          navigate(`/lobby/${result.gameId}`);
        }
      } else {
        navigate("/host-game/import");
      }
    },
    [game, user, mp, navigate],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        await submit();
      } finally {
        setBusy(false);
      }
    },
    [busy, submit],
  );

  const connecting = authLoading && !!game.urlPuzzle;
  const pending = busy || connecting;

  return (
    <FlowPage
      title={t('hostName.heading')}
      subtitle={game.urlPuzzle ? t('hostName.subtitleCreate') : t('hostName.subtitlePick')}
      onBack={handleReset}
      backLabel={t('hostName.back')}
    >
      <form onSubmit={handleSubmit} className="grid gap-5" autoComplete="off">
        {game.urlPuzzle && (
          <Card className="flex items-center gap-4 p-4">
            <MiniGridThumb puzzle={game.urlPuzzle} className="w-16 shrink-0" />
            <div className="min-w-0">
              <Eyebrow>{t('hostName.puzzleLabel')}</Eyebrow>
              <p className="mt-0.5 truncate font-display text-lg font-bold leading-snug text-ink">{game.urlPuzzle.title}</p>
              <p className="text-sm text-muted tabular-nums">
                {game.urlPuzzle.width}×{game.urlPuzzle.height}
              </p>
            </div>
          </Card>
        )}
        <TextField
          id="host-display-name"
          label={t('hostName.yourName')}
          type="text"
          name="xw-handle"
          value={game.displayName}
          onChange={(e) => game.setDisplayName(e.target.value)}
          maxLength={20}
          enterKeyHint="go"
          autoCapitalize="words"
          autoCorrect="off"
          autoComplete="nofill"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore
          autoFocus
        />
        <Button type="submit" size="lg" block disabled={!game.displayName.trim() || pending} aria-busy={pending || undefined}>
          {pending && <Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          {busy ? t('hostName.creating') : connecting ? t('join.connecting') : game.urlPuzzle ? t('hostName.createRoom') : t('hostName.choosePuzzle')}
        </Button>
      </form>
    </FlowPage>
  );
}
