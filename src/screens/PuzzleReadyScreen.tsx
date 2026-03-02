import { useCallback } from "react";
import { Navigate, useNavigate } from "react-router";
import { PuzzleReady } from "../components/PuzzleReady";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { compressPuzzleToHash } from "../lib/puzzleUrl";

export function PuzzleReadyScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();

  const handlePlaySolo = useCallback(async () => {
    if (!game.urlPuzzle) return;
    await game.handleSoloPuzzleLoaded(game.urlPuzzle);
    navigate("/solo/play");
  }, [game, navigate]);

  const handleHostGame = useCallback(() => {
    if (!game.urlPuzzle) return;
    game.loadPuzzle(game.urlPuzzle);
    navigate("/host-game/name");
  }, [game, navigate]);

  const handleHostOnTV = useCallback(() => {
    if (!game.urlPuzzle) return;
    const hash = compressPuzzleToHash(game.urlPuzzle);
    window.location.href = "/host" + hash;
  }, [game.urlPuzzle]);

  if (!game.urlPuzzle) {
    return <Navigate to="/" replace />;
  }

  return (
    <PuzzleReady
      puzzle={game.urlPuzzle}
      showHostOptions={!!user}
      onPlaySolo={handlePlaySolo}
      onHostGame={handleHostGame}
      onHostOnTV={handleHostOnTV}
    />
  );
}
