import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { AuthProvider } from "../contexts/AuthContext";
import { GameProvider } from "../contexts/GameContext";
import { MultiplayerProvider } from "../contexts/MultiplayerContext";
import { extractPuzzleFromUrl, hasImportHash } from "../lib/puzzleUrl";
import { useGame } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import { loadMpSession, clearMpSession, saveMpSession } from "../lib/sessionPersistence";
import { rejoinGame } from "../lib/puzzleService";

/**
 * Inner component that handles routing side effects:
 * - #puzzle= hash detection
 * - ?join= query param redirect
 * - multiplayer session rejoin redirect
 * - room closed redirect
 * - new_game broadcast redirect
 * - game_started transition
 */
function RoutingEffects({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const game = useGame();
  const mp = useMultiplayerContext();

  // Handle #puzzle= hash changes
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash.startsWith("#puzzle=")) {
        const puzzle = extractPuzzleFromUrl();
        if (puzzle) {
          game.setUrlPuzzle(puzzle);
          navigate("/puzzle-ready");
        }
      } else if (hasImportHash()) {
        game.setImportFailed(false);
        navigate("/importing");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [navigate, game]);

  // Boot non-host players when the host closes the room
  useEffect(() => {
    if (mp.isRoomClosed) {
      game.reset();
      game.setGameId(null);
      game.setIsMultiplayer(false);
      localStorage.removeItem("crossword-clash-solo");
      clearMpSession();
      navigate("/");
    }
  }, [mp.isRoomClosed, game, navigate]);

  // Handle new_game broadcast for non-host players
  useEffect(() => {
    if (!mp.newGameId || mp.isHost) return;
    game.setGameId(mp.newGameId);
    saveMpSession({ gameId: mp.newGameId, shareCode: mp.shareCode, displayName: game.displayName });
    navigate("/rejoin");
  }, [mp.newGameId, mp.isHost, mp.shareCode, game, navigate]);

  return <>{children}</>;
}

/**
 * Rejoin handler component - handles the /rejoin route logic.
 * This lives here instead of in the screen because it needs to run
 * as a side effect that triggers navigation.
 */
export function useRejoinEffect() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();

  useEffect(() => {
    if (!user) return;
    const session = loadMpSession();
    if (!session) {
      navigate("/", { replace: true });
      return;
    }

    rejoinGame(session.gameId, user.id, session.displayName).then((result) => {
      if (!result) {
        clearMpSession();
        navigate("/", { replace: true });
        return;
      }

      game.loadPuzzle(result.puzzle);
      if (result.cells && Object.keys(result.cells).length > 0) {
        const cellScore = Object.values(result.cells).filter((c: { correct: boolean }) => c.correct).length;
        game.dispatch({ type: "HYDRATE_CELLS", cells: result.cells, score: cellScore });
      }

      game.setGameId(result.gameId);
      game.setIsMultiplayer(true);

      if (result.status === "waiting") {
        navigate(`/lobby/${result.gameId}`, { replace: true });
      } else {
        navigate(`/play/${result.gameId}`, { replace: true });
      }
    });
  }, [user, game, navigate]);
}

export function RootLayout() {
  return (
    <AuthProvider>
      <GameProvider>
        <MultiplayerProvider>
          <RoutingEffects>
            <Outlet />
          </RoutingEffects>
        </MultiplayerProvider>
      </GameProvider>
    </AuthProvider>
  );
}
