import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { JoinGame } from "../components/GameLobby";
import { useAuth } from "../contexts/AuthContext";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { joinGame } from "../lib/puzzleService";
import { clearMpSession } from "../lib/sessionPersistence";
import { tStatic } from "../i18n/i18n";

export function JoinScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();

  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const initialCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code && code.length === 6) {
      window.history.replaceState({}, "", window.location.pathname);
      return code.toUpperCase();
    }
    return game.initialJoinCode ?? undefined;
  }, [game.initialJoinCode]);

  const handleJoin = useCallback(
    async (code: string, displayName: string) => {
      if (!user) return;
      setJoinLoading(true);
      setJoinError(null);

      const result = await joinGame(code, user.id, displayName);
      if (!result) {
        setJoinError(tStatic('join.notFound'));
        setJoinLoading(false);
        return;
      }

      game.loadPuzzle(result.puzzle);
      game.setGameId(result.gameId);
      game.setIsMultiplayer(true);
      setJoinLoading(false);

      if (result.status === "waiting") {
        navigate(`/lobby/${result.gameId}`);
      } else {
        navigate(`/play/${result.gameId}`);
      }
    },
    [user, game, navigate],
  );

  const handleBack = useCallback(() => {
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/");
  }, [game, navigate]);

  return (
    <JoinGame
      onJoin={handleJoin}
      onBack={handleBack}
      loading={joinLoading}
      error={joinError}
      initialCode={initialCode}
    />
  );
}
