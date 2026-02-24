import { useEffect, useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  claimCellOnServer,
  fetchGameState,
  startGame as startGameOnServer,
} from "../lib/puzzleService";
import type { Player } from "../types/game";
import type { CellState } from "../types/puzzle";
import type { RealtimeChannel } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dispatch = (action: any) => void;

interface UseMultiplayerOptions {
  gameId: string;
  userId: string;
  puzzle: { cells: { solution: string | null }[][] };
  dispatch: Dispatch;
  playerCells: Record<string, CellState>;
  totalWhiteCells: number;
}

interface UseMultiplayerReturn {
  claimCell: (row: number, col: number, letter: string) => void;
  startGame: () => Promise<void>;
  closeRoom: () => Promise<void>;
  players: Player[];
  gameStatus: "waiting" | "active" | "completed";
  isHost: boolean;
  shareCode: string | null;
  isRoomClosed: boolean;
}

export function useMultiplayer({
  gameId,
  userId,
  puzzle,
  dispatch,
  playerCells,
  totalWhiteCells,
}: UseMultiplayerOptions): UseMultiplayerReturn {
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameStatus, setGameStatus] = useState<"waiting" | "active" | "completed">("waiting");
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerCellsRef = useRef(playerCells);
  playerCellsRef.current = playerCells;
  const announcedRef = useRef(false);

  // Hydrate state from DB — returns fetched state for callers
  const hydrate = useCallback(async () => {
    if (!gameId) return null;
    const state = await fetchGameState(gameId);
    if (!state) return null;

    setPlayers(state.players);
    setGameStatus(state.status as "waiting" | "active" | "completed");

    // Determine host from DB-ordered players (first by created_at)
    if (state.players.length > 0) {
      setIsHost(state.players[0].userId === userId);
    }

    const score = Object.values(state.cells).filter((c) => c.correct).length;
    dispatch({ type: "HYDRATE_CELLS", cells: state.cells, score });

    return state;
  }, [gameId, userId, dispatch]);

  // Subscribe to Broadcast channel
  useEffect(() => {
    if (!supabase || !gameId) return;

    announcedRef.current = false;

    // Fetch short_code
    supabase
      .from("games")
      .select("short_code")
      .eq("id", gameId)
      .single()
      .then(({ data }) => {
        if (data?.short_code) setShareCode(data.short_code);
      });

    const channel = supabase.channel(`game:${gameId}`);
    channelRef.current = channel;

    channel.on("broadcast", { event: "cell_claimed" }, ({ payload }) => {
      // Ignore our own echoes
      if (payload.playerId === userId) return;
      dispatch({
        type: "REMOTE_CELL_CLAIM",
        row: payload.row,
        col: payload.col,
        letter: payload.letter,
        playerId: payload.playerId,
      });
    });

    channel.on("broadcast", { event: "player_joined" }, ({ payload }) => {
      setPlayers((prev) => {
        if (prev.find((p) => p.userId === payload.player.userId)) return prev;
        return [...prev, payload.player];
      });
    });

    channel.on("broadcast", { event: "player_left" }, ({ payload }) => {
      setPlayers((prev) => prev.filter((p) => p.userId !== payload.userId));
    });

    channel.on("broadcast", { event: "game_started" }, () => {
      setGameStatus("active");
    });

    channel.on("broadcast", { event: "game_completed" }, () => {
      setGameStatus("completed");
    });

    channel.on("broadcast", { event: "room_closed" }, () => {
      setIsRoomClosed(true);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const state = await hydrate();

        // Announce presence to other players (once per connection)
        if (state && !announcedRef.current) {
          const self = state.players.find((p) => p.userId === userId);
          if (self) {
            channel.send({
              type: "broadcast",
              event: "player_joined",
              payload: { player: self },
            });
            announcedRef.current = true;
          }
        }
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [gameId, userId, dispatch, hydrate]);

  // Re-hydrate on visibility change (tab wake)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        hydrate();
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hydrate]);

  // Check completion when cells change
  useEffect(() => {
    if (gameStatus !== "active") return;
    const filledCount = Object.values(playerCells).filter((c) => c.correct).length;
    if (totalWhiteCells > 0 && filledCount === totalWhiteCells) {
      setGameStatus("completed");
      // Update DB
      if (supabase) {
        supabase
          .from("games")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", gameId)
          .then(() => {
            channelRef.current?.send({
              type: "broadcast",
              event: "game_completed",
              payload: {},
            });
          });
      }
    }
  }, [playerCells, totalWhiteCells, gameStatus, gameId]);

  const claimCell = useCallback(
    async (row: number, col: number, letter: string) => {
      const key = `${row},${col}`;

      // Local check: already filled
      if (playerCellsRef.current[key]?.correct) return;

      // Check correctness
      const solution = puzzle.cells[row]?.[col]?.solution;
      if (!solution || letter.toUpperCase() !== solution) return;

      // Optimistic local dispatch
      dispatch({
        type: "INPUT_LETTER",
        letter: letter.toUpperCase(),
        playerId: userId,
      });

      // Server claim
      const success = await claimCellOnServer(
        gameId,
        key,
        letter.toUpperCase(),
        userId,
        true,
      );

      if (success) {
        // Broadcast to others
        channelRef.current?.send({
          type: "broadcast",
          event: "cell_claimed",
          payload: { row, col, letter: letter.toUpperCase(), playerId: userId },
        });
      } else {
        // Rollback optimistic write
        dispatch({
          type: "ROLLBACK_CELL",
          row,
          col,
          playerId: userId,
        });
        // Re-hydrate to get the winner's state
        hydrate();
      }
    },
    [gameId, userId, puzzle, dispatch, hydrate],
  );

  const startGame = useCallback(async () => {
    const success = await startGameOnServer(gameId);
    if (success) {
      setGameStatus("active");
      channelRef.current?.send({
        type: "broadcast",
        event: "game_started",
        payload: {},
      });
    }
  }, [gameId]);

  const closeRoom = useCallback(async () => {
    if (!supabase || !gameId) return;
    await channelRef.current?.send({
      type: "broadcast",
      event: "room_closed",
      payload: {},
    });
    await supabase
      .from("games")
      .update({ status: "closed" })
      .eq("id", gameId);
  }, [gameId]);

  return {
    claimCell,
    startGame,
    closeRoom,
    players,
    gameStatus,
    isHost,
    shareCode,
    isRoomClosed,
  };
}
