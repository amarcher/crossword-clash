import { puzzleIdentity } from "../lib/soloStats";
import { useCallback, useEffect } from "react";
import { Navigate, useNavigate } from "react-router";
import { GameLobby } from "../components/GameLobby";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useBeforeUnload } from "../hooks/useBeforeUnload";
import { clearMpSession } from "../lib/sessionPersistence";
import { tStatic } from "../i18n/i18n";
import { useConfirm } from "../components/ConfirmDialog";
import { LobbyInvites } from "../components/Friends";
import { useFriends } from "../contexts/FriendsContext";
import { friendsEnabled, NUDGE_BACKOFF_MS } from "../lib/friends";

export function LobbyScreen() {
  const navigate = useNavigate();
  const game = useGame();
  const mp = useMultiplayerContext();
  const friends = useFriends();

  const confirm = useConfirm();

  useBeforeUnload(true);

  // Transition from lobby to playing when game starts (for non-host)
  useEffect(() => {
    if (mp.gameStatus === "active" && game.gameId) {
      navigate(`/play/${game.gameId}`, { replace: true });
    }
  }, [mp.gameStatus, game.gameId, navigate]);

  const handleStartGame = useCallback(async () => {
    await mp.startGame({
      wrongAnswerTimeoutSeconds: game.wrongAnswerTimeout,
      raceMode: game.raceMode,
    });
    if (game.gameId) {
      navigate(`/play/${game.gameId}`);
    }
  }, [mp, game.wrongAnswerTimeout, game.raceMode, game.gameId, navigate]);

  const handleCloseRoom = useCallback(async () => {
    const ok = await confirm({
      title: tStatic('playing.closeRoomConfirm'),
      confirmLabel: tStatic('playing.closeRoom'),
      tone: 'danger',
    });
    if (!ok) return;
    await mp.closeRoom();
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/menu");
  }, [mp, game, navigate, confirm]);

  const handleLeave = useCallback(async () => {
    await mp.leaveGame();
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/menu");
  }, [mp, game, navigate]);

  const gameId = game.gameId;
  const handleNudge = useCallback(
    async (spellStartedAt: number) => (gameId ? friends.nudge(gameId, spellStartedAt) : NUDGE_BACKOFF_MS[0] / 1000),
    [friends, gameId],
  );

  if (!game.puzzle) return <Navigate to="/" replace />;

  return (
    <GameLobby
      shareCode={mp.shareCode}
      players={mp.players}
      isHost={mp.isHost}
      onStartGame={handleStartGame}
      onCloseRoom={handleCloseRoom}
      onLeave={handleLeave}
      wrongAnswerTimeout={game.wrongAnswerTimeout}
      onWrongAnswerTimeoutChange={game.setWrongAnswerTimeout}
      raceMode={game.raceMode}
      onRaceModeChange={game.setRaceMode}
      invites={game.gameId ? <LobbyInvites gameId={game.gameId} players={mp.players} puzzleKey={game.puzzle ? puzzleIdentity(game.puzzle) : null} /> : null}
      onNudgeHost={friendsEnabled() && game.gameId && !mp.isHost ? handleNudge : undefined}
    />
  );
}
