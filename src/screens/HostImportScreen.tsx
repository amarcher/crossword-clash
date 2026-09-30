import { useCallback } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { PuzzleImporter } from "../components/PuzzleImporter";
import { BackButton } from "../components/Flow";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import {
  uploadPuzzle,
  createGame,
  createNextGame,
} from "../lib/puzzleService";
import { tStatic } from "../i18n/i18n";
import type { Puzzle } from "../types/puzzle";

export function HostImportScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();
  const mp = useMultiplayerContext();

  const handleHostPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      game.loadPuzzle(p);
      game.fileBufferRef.current = fileBuffer ?? null;

      if (!user) return;
      const puzzleId = await uploadPuzzle(p, fileBuffer);
      if (!puzzleId) return;

      // If we have an existing share code, reuse it for the next game
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
    },
    [game, user, mp, navigate],
  );

  return (
    <>
      {/* Same chevron back pattern as the other host flow screens; the importer below owns its own page. */}
      <div className="crossword-bg px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center">
          <BackButton onClick={() => navigate("/host-game/name")} label={t("hostName.back")} />
        </div>
      </div>
      <PuzzleImporter onPuzzleLoaded={handleHostPuzzleLoaded} />
    </>
  );
}
