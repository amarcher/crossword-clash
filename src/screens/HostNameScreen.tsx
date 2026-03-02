import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../components/Title";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import {
  uploadPuzzle,
  createGame,
  createNextGame,
} from "../lib/puzzleService";
import { clearMpSession } from "../lib/sessionPersistence";
import { tStatic } from "../i18n/i18n";

export function HostNameScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!game.displayName.trim()) return;

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
          navigate(`/lobby/${result.gameId}`);
        }
      } else {
        navigate("/host-game/import");
      }
    },
    [game, user, mp, navigate],
  );

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
      <Title className="mb-2" />
      <p className="text-neutral-500 mb-6">{t('hostName.enterDisplayName')}</p>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 w-full max-w-xs"
        autoComplete="off"
      >
        <input
          type="text"
          name="xw-handle"
          value={game.displayName}
          onChange={(e) => game.setDisplayName(e.target.value)}
          placeholder={t('hostName.yourName')}
          aria-label={t('hostName.yourName')}
          maxLength={20}
          className="px-4 py-2.5 rounded-lg border border-neutral-300 text-center text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          autoComplete="nofill"
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore
          autoFocus
        />
        <button
          type="submit"
          disabled={!game.displayName.trim()}
          className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
        >
          {t('hostName.choosePuzzle')}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="text-sm text-neutral-500 hover:text-neutral-700"
        >
          {t('hostName.back')}
        </button>
      </form>
    </div>
  );
}
