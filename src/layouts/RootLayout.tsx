import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AuthProvider } from "../contexts/AuthContext";
import { AccountProvider } from "../contexts/AccountContext";
import { GameProvider } from "../contexts/GameContext";
import { MultiplayerProvider } from "../contexts/MultiplayerContext";
import { FriendsProvider } from "../contexts/FriendsContext";
import { InviteBanner } from "../components/Friends";
import { extractPuzzleFromUrl, hasImportHash } from "../lib/puzzleUrl";
import { useGame } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import { loadMpSession, clearMpSession, saveMpSession, isRecentMpSession } from "../lib/sessionPersistence";
import { rejoinGame } from "../lib/puzzleService";
import { ToastViewport } from "../components/ToastViewport";
import { usePageViews } from "../hooks/usePageViews";
import { startAppLinks } from "../lib/appLinks";

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
  const [showRoomClosedModal, setShowRoomClosedModal] = useState(false);
  usePageViews();

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

  // Links opened into the apps (universal links / App Links): a room's QR
  // code or invite lands on the join screen, a challenge or community link
  // on its page; a puzzle payload goes through the hash listener above.
  useEffect(
    () =>
      startAppLinks((target) => {
        if (target.kind === "hash") window.location.hash = target.hash;
        else navigate(target.to);
      }),
    [navigate],
  );

  // When host closes the room: show explanatory modal to non-hosts before
  // teleporting them to the menu. Hosts navigate themselves via their UI;
  // we only pop the modal for players who didn't initiate the close.
  // Session is preserved until the user acknowledges, so a refresh during
  // the modal does not strand them.
  useEffect(() => {
    if (mp.isRoomClosed && !mp.isHost) {
      setShowRoomClosedModal(true);
    }
  }, [mp.isRoomClosed, mp.isHost]);

  const dismissRoomClosed = useCallback(() => {
    setShowRoomClosedModal(false);
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem("crossword-clash-solo");
    clearMpSession();
    navigate("/menu");
  }, [game, navigate]);

  // Host's own room close still navigates immediately (host owns the action).
  useEffect(() => {
    if (mp.isRoomClosed && mp.isHost) {
      game.reset();
      game.setGameId(null);
      game.setIsMultiplayer(false);
      localStorage.removeItem("crossword-clash-solo");
      clearMpSession();
      navigate("/menu");
    }
  }, [mp.isRoomClosed, mp.isHost, game, navigate]);

  // Handle new_game broadcast for non-host players
  useEffect(() => {
    if (!mp.newGameId || mp.isHost) return;
    game.setGameId(mp.newGameId);
    saveMpSession({ gameId: mp.newGameId, shareCode: mp.shareCode, displayName: game.displayName });
    navigate("/rejoin");
  }, [mp.newGameId, mp.isHost, mp.shareCode, game, navigate]);

  return (
    <>
      {children}
      {showRoomClosedModal && <RoomClosedModal onDismiss={dismissRoomClosed} />}
    </>
  );
}

function RoomClosedModal({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-closed-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onDismiss} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 sm:p-8 text-center">
        <h2 id="room-closed-title" className="text-xl font-bold mb-2 text-neutral-900">
          {t("lobby.roomClosedTitle")}
        </h2>
        <p className="text-neutral-600 mb-6">{t("lobby.roomClosedNotice")}</p>
        <button
          autoFocus
          onClick={onDismiss}
          className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {t("lobby.roomClosedAction")}
        </button>
      </div>
    </div>
  );
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

      // A room that never started is only worth walking back into when the
      // player was in it recently; an hour-old lobby on launch is the stale
      // room they closed the app on, not the game they want to play.
      if (result.status === "waiting" && !isRecentMpSession(session)) {
        clearMpSession();
        game.setGameId(null);
        game.setIsMultiplayer(false);
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
      <AccountProvider>
        <GameProvider>
          <MultiplayerProvider>
            <FriendsProvider>
              <RoutingEffects>
                <Outlet />
              </RoutingEffects>
              <InviteBanner />
              <ToastViewport />
            </FriendsProvider>
          </MultiplayerProvider>
        </GameProvider>
      </AccountProvider>
    </AuthProvider>
  );
}
