import { puzzleIdentity } from "../lib/soloStats";
import { useCallback, useEffect, useMemo } from "react";
import { useRoomSolves } from "../hooks/useRoomSolves";
import { Navigate, useNavigate } from "react-router";
import { GameLobby } from "../components/GameLobby";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useAuth } from "../contexts/AuthContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useBeforeUnload } from "../hooks/useBeforeUnload";
import { clearMpSession } from "../lib/sessionPersistence";
import { tStatic } from "../i18n/i18n";
import { resolveRaceMode } from "../lib/gameSettings";
import { useConfirm } from "../components/ConfirmDialog";
import { LobbyInvites } from "../components/Friends";
import { useFriends } from "../contexts/FriendsContext";
import { friendsEnabled, NUDGE_BACKOFF_MS } from "../lib/friends";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";

export function LobbyScreen() {
  const navigate = useTransitionNavigate();
  // Exits that clear the game first stay plain: the cleared screen's own
  // redirect runs before a cross-fade could capture it.
  const exit = useNavigate();
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
      // The puzzle's own link, so every player's finish can share the replay clip.
      ...(game.puzzle?.ref ? { puzzleRef: game.puzzle.ref } : {}),
    });
    if (game.gameId) {
      navigate(`/play/${game.gameId}`);
    }
  }, [mp, game.wrongAnswerTimeout, game.raceMode, game.puzzle, game.gameId, navigate]);

  // Joiners see the mode before Start: the host says it on every change, and
  // again when the roster changes, so someone who just arrived hears it too.
  const { isHost, announceLobbySettings } = mp;
  const rosterSize = mp.players.length;
  useEffect(() => {
    if (!isHost || mp.gameStatus !== "waiting") return;
    announceLobbySettings({ wrongAnswerTimeoutSeconds: game.wrongAnswerTimeout, raceMode: game.raceMode });
  }, [isHost, mp.gameStatus, announceLobbySettings, game.wrongAnswerTimeout, game.raceMode, rosterSize]);

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
    exit("/menu");
  }, [mp, game, exit, confirm]);

  const handleLeave = useCallback(async () => {
    await mp.leaveGame();
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    exit("/menu");
  }, [mp, game, exit]);

  const gameId = game.gameId;
  // Who in the room has finished this puzzle before (room_solves): a chip on their row.
  const { user } = useAuth();
  const playerIds = useMemo(() => mp.players.map((p) => p.userId), [mp.players]);
  const solves = useRoomSolves(user?.id, game.gameId, game.puzzle ? puzzleIdentity(game.puzzle) : null, playerIds);

  const handleNudge = useCallback(
    async (spellStartedAt: number) => (gameId ? friends.nudge(gameId, spellStartedAt) : NUDGE_BACKOFF_MS[0] / 1000),
    [friends, gameId],
  );

  if (!game.puzzle) return <Navigate to="/" replace />;

  return (
    <GameLobby
      shareCode={mp.shareCode}
      players={mp.players}
      solves={solves}
      isHost={mp.isHost}
      onStartGame={handleStartGame}
      onCloseRoom={handleCloseRoom}
      onLeave={handleLeave}
      wrongAnswerTimeout={game.wrongAnswerTimeout}
      onWrongAnswerTimeoutChange={game.setWrongAnswerTimeout}
      raceMode={mp.isHost ? game.raceMode : mp.lobbySettings ? resolveRaceMode(mp.lobbySettings) : undefined}
      onRaceModeChange={game.setRaceMode}
      invites={game.gameId ? <LobbyInvites gameId={game.gameId} players={mp.players} puzzleKey={game.puzzle ? puzzleIdentity(game.puzzle) : null} /> : null}
      onNudgeHost={friendsEnabled() && game.gameId && !mp.isHost ? handleNudge : undefined}
    />
  );
}
