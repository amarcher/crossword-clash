import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { JoinGame } from "../components/GameLobby";
import { useAuth } from "../contexts/AuthContext";
import { useAccountContext } from "../contexts/AccountContext";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { joinGame } from "../lib/puzzleService";
import { friendsEnabled, notifyRoomJoined } from "../lib/friends";
import { clearMpSession } from "../lib/sessionPersistence";
import { savePlayerName } from "../lib/playerName";
import { tStatic } from "../i18n/i18n";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { useOnDialogClose } from "../components/RouteDialog";

export function JoinScreen() {
  const navigate = useTransitionNavigate();
  const typedCode = (useLocation().state as { auto?: boolean } | null)?.auto === true;
  const { user, loading: authLoading } = useAuth();
  const game = useGame();
  const { profile, ready, profileReady } = useAccountContext();

  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  // A join tapped before the anonymous session finished loading is queued here
  // and runs the moment the user arrives (instead of silently doing nothing).
  const [waitingForAuth, setWaitingForAuth] = useState(false);
  const pendingJoin = useRef<{ code: string; displayName: string } | null>(null);
  // Cleared when the player leaves (Back, the dialog's close): a join still in
  // flight then never loads its room or navigates after they have gone.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The link's code, else the one the page was opened with — read once, and
  // the page's copy consumed, so a later visit to Join starts blank instead
  // of offering the first invite's code again (Andrew, 2026-11-03: the join
  // screen kept offering a finished room's code during the second race).
  const [initialCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code && code.length === 6) {
      window.history.replaceState({}, "", window.location.pathname);
      return code.toUpperCase();
    }
    return game.initialJoinCode ?? undefined;
  });
  // A code that came with the page (an invite link, the room's QR code, the
  // invite banner's Join) is a decision already made: join at once when a
  // name is known, instead of a form to confirm (Andrew, 2026-11-14). It
  // waits for the account, so a signed-in player joins under their username.
  const autoJoin = typedCode || (!!initialCode && ready && profileReady);
  const { consumeInitialJoinCode } = game;
  useEffect(() => {
    consumeInitialJoinCode();
  }, [consumeInitialJoinCode]);

  const runJoin = useCallback(
    async (code: string, displayName: string, userId: string) => {
      setJoinLoading(true);
      setJoinError(null);

      const result = await joinGame(code, userId, displayName);
      if (!live.current) return;
      if (!result) {
        setJoinError(tStatic('join.notFound'));
        setJoinLoading(false);
        return;
      }

      game.loadPuzzle(result.puzzle);
      game.setGameId(result.gameId);
      game.setIsMultiplayer(true);
      // This room's finish gets its own modal: the previous race's dismissal
      // must not hide it (the host paths reset this too; the joiner's never
      // did, and a second race as a joiner ended without a winner screen).
      game.setCompletionModalDismissed(false);
      // Adopt the joiner's typed name into game state (it previously stayed
      // the anonymous default, so daily-race results posted as "Player") and
      // persist it for future sessions.
      game.setDisplayName(displayName);
      savePlayerName(displayName);
      setJoinLoading(false);
      // Tell the host someone arrived (phase f): the web's stand-in for the
      // players push, only on the first join into a room still waiting.
      if (friendsEnabled() && result.firstJoin && result.status === "waiting" && result.hostUserId && result.hostUserId !== userId) {
        notifyRoomJoined(result.hostUserId, result.gameId);
      }

      if (result.status === "waiting") {
        navigate(`/lobby/${result.gameId}`);
      } else {
        navigate(`/play/${result.gameId}`);
      }
    },
    [game, navigate],
  );

  const handleJoin = useCallback(
    (code: string, displayName: string) => {
      if (user) {
        void runJoin(code, displayName, user.id);
        return;
      }
      if (authLoading) {
        pendingJoin.current = { code, displayName };
        setJoinError(null);
        setWaitingForAuth(true);
      } else {
        setJoinError(tStatic('join.connectFailed'));
      }
    },
    [user, authLoading, runJoin],
  );

  // Resolve a queued join once auth settles (user arrived, or loading failed).
  useEffect(() => {
    if (!waitingForAuth) return;
    if (!user && authLoading) return;
    const pending = pendingJoin.current;
    pendingJoin.current = null;
    setWaitingForAuth(false);
    if (user && pending) void runJoin(pending.code, pending.displayName, user.id);
    else if (!user) setJoinError(tStatic('join.connectFailed'));
  }, [waitingForAuth, user, authLoading, runJoin]);

  // Closing the dialog abandons a half-finished join, as Back to menu does on
  // a phone (Andrew, 2026-11-25: cleared), but leaves the page underneath —
  // which stays mounted — alone: no reset of its puzzle, no solo session wiped.
  const abandonJoin = useCallback(() => {
    live.current = false;
    pendingJoin.current = null;
    game.setGameId(null);
    game.setIsMultiplayer(false);
    clearMpSession();
  }, [game]);
  useOnDialogClose(abandonJoin);

  const handleBack = useCallback(() => {
    live.current = false;
    pendingJoin.current = null;
    game.reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/menu");
  }, [game, navigate]);

  return (
    <JoinGame
      onJoin={handleJoin}
      onBack={handleBack}
      loading={joinLoading || waitingForAuth}
      connecting={waitingForAuth}
      error={joinError}
      initialCode={initialCode}
      initialName={profile?.username}
      autoJoin={autoJoin}
    />
  );
}
