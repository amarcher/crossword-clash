import { useCallback } from "react";
import { useNavigate } from "react-router";
import { PuzzleImporter } from "../components/PuzzleImporter";
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

  return <PuzzleImporter onPuzzleLoaded={handleHostPuzzleLoaded} />;
}
