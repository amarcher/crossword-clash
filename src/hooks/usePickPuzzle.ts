import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { createGame, createNextGame, uploadPuzzle } from "../lib/puzzleService";
import { useMaybeAccount } from "../contexts/AccountContext";
import { savePlayerName } from "../lib/playerName";
import { clearMpSession, saveMpSession } from "../lib/sessionPersistence";
import { clearSoloTimer } from "../lib/soloStats";
import { clearChallenge } from "../lib/challenge";
import { tStatic } from "../i18n/i18n";
import { track } from "../lib/analytics";
import type { DailySlot } from "../lib/dailyFeed";
import type { Puzzle } from "../types/puzzle";
import { useTransitionNavigate } from "./useTransitionNavigate";

/** What picking a puzzle means: host it fresh (name → lobby), or make it the room's next game. */
export type PickerIntent = "race" | "next";

export function pickerPath(intent: PickerIntent): string {
  return `/pick-puzzle?intent=${intent}`;
}

/** The `?pick=` a browsing screen (past puzzles, community puzzles) carries while it is picking for a room. */
export function pickIntent(params: URLSearchParams): PickerIntent | null {
  const pick = params.get("pick");
  return pick === "race" || pick === "next" ? pick : null;
}

/**
 * Picking a puzzle for a room, from the picker or from a browsing screen in pick mode.
 *
 * - `race` opens a room on it at once under the player's username and lands in the lobby
 *   (Andrew, 2026-11-19: the room is where the puzzle and the players are chosen), after
 *   tearing down any finished solo or room state. A player with no username is asked for a
 *   name first (HostNameScreen), which then makes the room.
 * - `next` keeps the room: the puzzle is uploaded and `createNextGame` is called with ITS id.
 *   The room code stays and the other players follow the `new_game` broadcast to the lobby.
 *   Falls back to the race path when there is no room to keep.
 */
export function usePickPuzzle(intent: PickerIntent) {
  const { t } = useTranslation();
  const navigate = useTransitionNavigate();
  const { user } = useAuth();
  const game = useGame();
  const mp = useMultiplayerContext();
  const username = useMaybeAccount()?.profile?.username;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(
    async (puzzle: Puzzle, key: string, slot?: DailySlot) => {
      setError(null);
      setBusy(key);
      try {
        // Only the host of a live room has a room to keep; a code alone may
        // be a leftover from a room someone else closed.
        const keepRoom = intent === "next" && !!user && !!mp.shareCode && !!game.gameId && mp.isHost;
        track("mode_selected", { mode: keepRoom ? "next-puzzle" : "picker-race", slot });
        if (keepRoom) {
          const puzzleId = await uploadPuzzle(puzzle);
          if (!puzzleId) throw new Error("upload failed");
          const displayName = game.displayName.trim() || tStatic("common.defaultPlayerName");
          const result = await createNextGame(puzzleId, user.id, mp.shareCode!, { displayName });
          if (!result) throw new Error("next game failed");
          game.loadPuzzle(puzzle);
          mp.broadcastNewGame(result.gameId);
          game.setGameId(result.gameId);
          game.setCompletionModalDismissed(false);
          saveMpSession({ gameId: result.gameId, shareCode: result.shortCode, displayName: game.displayName });
          navigate(`/lobby/${result.gameId}`, { replace: true });
          return;
        }
        // A fresh room: drop the finished solo/room state so the host flow
        // starts clean — the solved puzzle is never re-raced live.
        game.reset();
        game.setGameId(null);
        game.setIsMultiplayer(false);
        localStorage.removeItem(STORAGE_KEY);
        clearMpSession();
        clearSoloTimer();
        clearChallenge();
        game.setCompletionModalDismissed(false);
        if (user && username) {
          const puzzleId = await uploadPuzzle(puzzle);
          const room = puzzleId ? await createGame(puzzleId, user.id, { multiplayer: true, displayName: username }) : null;
          if (!room) throw new Error("room failed");
          game.setDisplayName(username);
          savePlayerName(username);
          game.loadPuzzle(puzzle);
          game.setGameId(room.gameId);
          game.setIsMultiplayer(true);
          game.setUrlPuzzle(null);
          navigate(`/lobby/${room.gameId}`, { replace: true });
          return;
        }
        game.setUrlPuzzle(puzzle);
        navigate("/host-game/name", { replace: true });
      } catch {
        setError(t("picker.error"));
        setBusy(null);
      }
    },
    [intent, user, username, mp, game, navigate, t],
  );

  /** A puzzle that could not be fetched before `choose`: the same message. */
  const fail = useCallback(() => setError(t("picker.error")), [t]);

  return { choose, busy, error, fail };
}
