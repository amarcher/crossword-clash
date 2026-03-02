import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { GameLobby } from "../components/GameLobby";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { clearMpSession } from "../lib/sessionPersistence";
import { tStatic } from "../i18n/i18n";

export function LobbyScreen() {
  const navigate = useNavigate();
  const game = useGame();
  const mp = useMultiplayerContext();

  // Transition from lobby to playing when game starts (for non-host)
  useEffect(() => {
    if (mp.gameStatus === "active" && game.gameId) {
      navigate(`/play/${game.gameId}`, { replace: true });
    }
  }, [mp.gameStatus, game.gameId, navigate]);

  const handleStartGame = useCallback(async () => {
    await mp.startGame({ wrongAnswerTimeoutSeconds: game.wrongAnswerTimeout });
    if (game.gameId) {
      navigate(`/play/${game.gameId}`);
    }
  }, [mp, game.wrongAnswerTimeout, game.gameId, navigate]);

  const handleCloseRoom = useCallback(async () => {
    if (!window.confirm(tStatic('playing.closeRoomConfirm'))) return;
    await mp.closeRoom();
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/");
  }, [mp, game, navigate]);

  return (
    <GameLobby
      shareCode={mp.shareCode}
      players={mp.players}
      isHost={mp.isHost}
      onStartGame={handleStartGame}
      onCloseRoom={handleCloseRoom}
      wrongAnswerTimeout={game.wrongAnswerTimeout}
      onWrongAnswerTimeoutChange={game.setWrongAnswerTimeout}
    />
  );
}
