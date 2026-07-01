import { useEffect, useCallback, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  claimCellOnServer,
  fetchGameState,
  recordRaceFinish,
  startGame as startGameOnServer,
} from "../lib/puzzleService";
import type { GameSettings, Player } from "../types/game";
import type { CellState } from "../types/puzzle";
import type { RealtimeChannel, RealtimePresenceState } from "@supabase/supabase-js";
import { DEFAULT_GAME_SETTINGS, resolveRaceMode } from "../lib/gameSettings";

interface TrackedPresence {
  user_id: string;
  display_name: string;
  color: string;
}

function presenceStateToPlayers(
  state: RealtimePresenceState<TrackedPresence>,
  gameId: string,
): Player[] {
  const out: Player[] = [];
  const seen = new Set<string>();
  for (const presences of Object.values(state)) {
    for (const p of presences) {
      if (seen.has(p.user_id)) continue;
      seen.add(p.user_id);
      out.push({
        id: p.user_id,
        gameId,
        userId: p.user_id,
        displayName: p.display_name,
        color: p.color,
        score: 0,
      });
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dispatch = (action: any) => void;

interface UseMultiplayerOptions {
  gameId: string;
  userId: string;
  puzzle: { cells: { solution: string | null }[][] };
  dispatch: Dispatch;
  playerCells: Record<string, CellState>;
  totalWhiteCells: number;
  onCellClaimed?: (row: number, col: number, letter: string, playerId: string) => void;
  onWrongLetter?: (
    row: number,
    col: number,
    expected: string,
    attempted: string,
    direction: "across" | "down",
    playerId: string,
  ) => void;
}

interface UseMultiplayerReturn {
  claimCell: (row: number, col: number, letter: string) => void;
  broadcastWrongLetter: (
    row: number,
    col: number,
    expected: string,
    attempted: string,
    direction: "across" | "down",
  ) => void;
  startGame: (settings?: GameSettings) => Promise<void>;
  closeRoom: () => Promise<void>;
  broadcastNewGame: (newGameId: string) => void;
  leaveGame: () => Promise<void>;
  players: Player[];
  gameStatus: "waiting" | "active" | "completed";
  gameSettings: GameSettings;
  isHost: boolean;
  shareCode: string | null;
  isRoomClosed: boolean;
  newGameId: string | null;
  hydrated: boolean;
  /**
   * Shared race time in whole seconds (game start → grid complete), or null
   * while the game is unstarted/in progress. Derived from the host's
   * game_started timestamp + the completion moment, backed by the DB's
   * started_at/completed_at for rejoiners.
   */
  raceSeconds: number | null;
  /** ms epoch when the host released the players, or null while waiting. */
  raceStartedAt: number | null;
  /** Async mode: userId → finish time (whole seconds) for finished players. */
  raceFinishTimes: Record<string, number>;
  /**
   * Async mode: record + broadcast the local player's finish. Returns the
   * elapsed seconds it recorded (or null when the race clock is unknown).
   */
  finishRace: () => number | null;
}

export function useMultiplayer({
  gameId,
  userId,
  puzzle,
  dispatch,
  playerCells,
  totalWhiteCells,
  onCellClaimed,
  onWrongLetter,
}: UseMultiplayerOptions): UseMultiplayerReturn {
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameStatus, setGameStatus] = useState<"waiting" | "active" | "completed">("waiting");
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [newGameId, setNewGameId] = useState<string | null>(null);
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  // Race clock (ms epoch). Seeded by broadcast timestamps for live clients and
  // by the DB's started_at/completed_at on hydrate, so refreshes keep the time.
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [completedAtMs, setCompletedAtMs] = useState<number | null>(null);
  // Async ("time trial") mode: per-player finish times, userId → seconds.
  const [raceFinishTimes, setRaceFinishTimes] = useState<Record<string, number>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerCellsRef = useRef(playerCells);
  playerCellsRef.current = playerCells;
  const onCellClaimedRef = useRef(onCellClaimed);
  onCellClaimedRef.current = onCellClaimed;
  const onWrongLetterRef = useRef(onWrongLetter);
  onWrongLetterRef.current = onWrongLetter;
  const announcedRef = useRef(false);
  // Flips true the first time presence sync delivers a non-empty roster.
  // Once warmed, we trust empty syncs (legitimately "all players left")
  // — before that, an empty sync just means our own track() hasn't landed.
  const presenceWarmedRef = useRef(false);

  // Hydrate state from DB — returns fetched state for callers
  const hydrate = useCallback(async () => {
    if (!gameId) return null;
    const state = await fetchGameState(gameId);
    if (!state) return null;

    setPlayers(state.players);
    // The DB stores 'closed' as a separate status; surface it as
    // isRoomClosed so backgrounded players who missed the broadcast
    // recover correctly. Other statuses pass through to gameStatus.
    if (state.status === "closed") {
      setIsRoomClosed(true);
    } else {
      setGameStatus(state.status as "waiting" | "active" | "completed");
    }

    if (state.settings && typeof state.settings.wrongAnswerTimeoutSeconds === "number") {
      setGameSettings({
        wrongAnswerTimeoutSeconds: state.settings.wrongAnswerTimeoutSeconds,
        raceMode: resolveRaceMode(state.settings as GameSettings),
      });
    }

    // DB timestamps are authoritative for the race clock (rejoin/refresh).
    if (state.startedAt != null) setStartedAtMs(state.startedAt);
    if (state.completedAt != null) setCompletedAtMs(state.completedAt);

    // Async mode: persisted finish times cover rejoiners / missed broadcasts.
    setRaceFinishTimes((prev) => {
      const next = { ...prev };
      for (const p of state.players) {
        if (typeof p.raceSeconds === "number") next[p.userId] = p.raceSeconds;
      }
      return next;
    });

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

    setHydrated(false);
    announcedRef.current = false;
    presenceWarmedRef.current = false;

    // Fetch short_code
    supabase
      .from("games")
      .select("short_code")
      .eq("id", gameId)
      .single()
      .then(({ data }) => {
        if (data?.short_code) setShareCode(data.short_code);
      });

    // ack:true gives `await channel.send(...)` real meaning — the promise
    // resolves on server acknowledgment instead of immediately. Adds one
    // round-trip per send (~50-100ms); acceptable because cell_claimed is
    // optimistic on the client and falls back to hydrate() on rollback.
    const channel = supabase.channel(`game:${gameId}`, {
      config: { broadcast: { ack: true } },
    });
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
      onCellClaimedRef.current?.(payload.row, payload.col, payload.letter, payload.playerId);
    });

    channel.on("broadcast", { event: "wrong_letter" }, ({ payload }) => {
      if (payload.playerId === userId) return;
      onWrongLetterRef.current?.(
        payload.row,
        payload.col,
        payload.expected,
        payload.attempted,
        payload.direction,
        payload.playerId,
      );
    });

    // Presence drives the live player roster. Each player calls
    // channel.track() with their display info; sync/join/leave keep us
    // in step. DB hydrate is the bootstrap fallback while presence warms.
    // Spectators (host-as-TV) never call track and so don't appear.
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<TrackedPresence>();
      const fromPresence = presenceStateToPlayers(state, gameId);
      if (fromPresence.length > 0) {
        presenceWarmedRef.current = true;
        setPlayers(fromPresence);
      } else if (presenceWarmedRef.current) {
        // Already warmed — an empty sync now means everyone legitimately
        // left. Trust it (don't keep stale players visible forever).
        setPlayers([]);
      }
      // Else: still warming up (our own track hasn't landed), keep the
      // initial DB hydrate roster in place to avoid a blank-then-fill flash.
    });

    channel.on("broadcast", { event: "game_started" }, ({ payload }) => {
      setGameStatus("active");
      if (payload?.settings) {
        setGameSettings(payload.settings);
      }
      // The host's clock anchors the shared race time for everyone.
      setStartedAtMs(typeof payload?.startedAt === "number" ? payload.startedAt : Date.now());
    });

    channel.on("broadcast", { event: "game_completed" }, ({ payload }) => {
      setGameStatus("completed");
      setCompletedAtMs((prev) =>
        prev ?? (typeof payload?.completedAt === "number" ? payload.completedAt : Date.now()),
      );
    });

    // Async mode: another player finished their own copy of the puzzle.
    channel.on("broadcast", { event: "race_finished" }, ({ payload }) => {
      if (typeof payload?.playerId !== "string" || typeof payload?.seconds !== "number") return;
      setRaceFinishTimes((prev) =>
        prev[payload.playerId] !== undefined && prev[payload.playerId] <= payload.seconds
          ? prev
          : { ...prev, [payload.playerId]: payload.seconds },
      );
    });

    channel.on("broadcast", { event: "room_closed" }, () => {
      setIsRoomClosed(true);
    });

    channel.on("broadcast", { event: "new_game" }, ({ payload }) => {
      setNewGameId(payload.gameId);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const state = await hydrate();
        setHydrated(true);

        // Track our presence so other clients see us live. Spectators
        // (no DB player row) skip tracking and remain invisible.
        if (state && !announcedRef.current) {
          const self = state.players.find((p) => p.userId === userId);
          if (self) {
            await channel.track({
              user_id: userId,
              display_name: self.displayName,
              color: self.color,
            } satisfies TrackedPresence);
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

  // Check completion when cells change (shared-grid modes only — in async
  // mode each client's local grid is their own copy, so a full local grid
  // means a PERSONAL finish, not the game's end; see finishRace()).
  useEffect(() => {
    if (gameStatus !== "active") return;
    if (resolveRaceMode(gameSettings) === "async") return;
    const filledCount = Object.values(playerCells).filter((c) => c.correct).length;
    if (totalWhiteCells > 0 && filledCount === totalWhiteCells) {
      const completedAt = Date.now();
      setGameStatus("completed");
      setCompletedAtMs((prev) => prev ?? completedAt);
      // Update DB
      if (supabase) {
        supabase
          .from("games")
          .update({
            status: "completed",
            completed_at: new Date(completedAt).toISOString(),
          })
          .eq("id", gameId)
          .then(() => {
            void channelRef.current
              ?.send({
                type: "broadcast",
                event: "game_completed",
                payload: { completedAt },
              })
              .catch(() => {});
          });
      }
    }
  }, [playerCells, totalWhiteCells, gameStatus, gameId, gameSettings]);

  // Async mode: the game is over when every player has a finish time.
  useEffect(() => {
    if (gameStatus !== "active") return;
    if (resolveRaceMode(gameSettings) !== "async") return;
    if (players.length === 0) return;
    const allFinished = players.every((p) => raceFinishTimes[p.userId] !== undefined);
    if (!allFinished) return;
    const completedAt = Date.now();
    setGameStatus("completed");
    setCompletedAtMs((prev) => prev ?? completedAt);
    // Idempotent — whichever client observes the final finish first wins;
    // duplicates just rewrite the same status.
    if (supabase) {
      supabase
        .from("games")
        .update({ status: "completed", completed_at: new Date(completedAt).toISOString() })
        .eq("id", gameId)
        .then(() => {
          void channelRef.current
            ?.send({ type: "broadcast", event: "game_completed", payload: { completedAt } })
            .catch(() => {});
        });
    }
  }, [gameStatus, gameSettings, players, raceFinishTimes, gameId]);

  /**
   * Async mode: the local player just filled their own copy. Compute the
   * elapsed time from the shared start, record it locally, broadcast it, and
   * persist it on our player row for rejoiners.
   */
  const finishRace = useCallback((): number | null => {
    if (startedAtMs == null) return null;
    const seconds = Math.max(0, Math.round((Date.now() - startedAtMs) / 1000));
    setRaceFinishTimes((prev) =>
      prev[userId] !== undefined ? prev : { ...prev, [userId]: seconds },
    );
    void channelRef.current
      ?.send({
        type: "broadcast",
        event: "race_finished",
        payload: { playerId: userId, seconds },
      })
      .catch(() => {});
    void recordRaceFinish(gameId, userId, seconds);
    return seconds;
  }, [startedAtMs, userId, gameId]);

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
        // Broadcast to others. State is already authoritative in DB; the
        // broadcast just speeds up other clients' view, so swallow any
        // ack-timeout rejection rather than fail the local claim.
        void channelRef.current
          ?.send({
            type: "broadcast",
            event: "cell_claimed",
            payload: { row, col, letter: letter.toUpperCase(), playerId: userId },
          })
          .catch(() => {});
        onCellClaimedRef.current?.(row, col, letter.toUpperCase(), userId);
      } else {
        // Rollback optimistic write. The reducer no-ops if a remote
        // cell_claimed already overwrote the cell with the winner's
        // playerId, so we always follow up with hydrate() to make the
        // DB the source of truth.
        dispatch({
          type: "ROLLBACK_CELL",
          row,
          col,
          playerId: userId,
        });
        // Restore the cursor to the contested cell. INPUT_LETTER had
        // advanced it; without this the user's selection is past the
        // cell they were trying to claim.
        dispatch({
          type: "SELECT_CELL",
          row,
          col,
        });
        // Re-hydrate to get the winner's state.
        hydrate();
      }
    },
    [gameId, userId, puzzle, dispatch, hydrate],
  );

  const broadcastWrongLetter = useCallback(
    (row: number, col: number, expected: string, attempted: string, direction: "across" | "down") => {
      // Channel-wide ack:true makes send() return a Promise that may reject
      // on timeout. Wrong-letter is best-effort flavor for the narrator —
      // swallow the rejection rather than surfacing as unhandled.
      void channelRef.current
        ?.send({
          type: "broadcast",
          event: "wrong_letter",
          payload: {
            row,
            col,
            expected: expected.toUpperCase(),
            attempted: attempted.toUpperCase(),
            direction,
            playerId: userId,
          },
        })
        .catch(() => {});
    },
    [userId],
  );

  const startGame = useCallback(async (settings?: GameSettings) => {
    const resolvedSettings = settings ?? DEFAULT_GAME_SETTINGS;
    const success = await startGameOnServer(gameId, resolvedSettings);
    if (success) {
      const startedAt = Date.now();
      setGameSettings(resolvedSettings);
      setGameStatus("active");
      setStartedAtMs(startedAt);
      void channelRef.current
        ?.send({
          type: "broadcast",
          event: "game_started",
          payload: { settings: resolvedSettings, startedAt },
        })
        .catch(() => {});
    }
  }, [gameId]);

  const broadcastNewGame = useCallback((newGameId: string) => {
    void channelRef.current
      ?.send({
        type: "broadcast",
        event: "new_game",
        payload: { gameId: newGameId },
      })
      .catch(() => {});
  }, []);

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

  // Untrack presence on intentional leave; Supabase fires presence.leave
  // on other clients within ~1s. Channel teardown happens in the
  // subscribe effect's cleanup.
  const leaveGame = useCallback(async () => {
    await channelRef.current?.untrack();
  }, []);

  // Defense-in-depth on tab close: force untrack early so other clients
  // GC us faster than Supabase's own dead-socket detection. Fire-and-forget
  // because the page is dying.
  useEffect(() => {
    if (!gameId) return;
    function fireUntrack() {
      channelRef.current?.untrack();
    }
    function handleVisibility() {
      if (document.visibilityState === "hidden") fireUntrack();
    }
    window.addEventListener("pagehide", fireUntrack);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", fireUntrack);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [gameId]);

  const raceSeconds =
    startedAtMs != null && completedAtMs != null && completedAtMs >= startedAtMs
      ? Math.round((completedAtMs - startedAtMs) / 1000)
      : null;

  return {
    claimCell,
    broadcastWrongLetter,
    startGame,
    closeRoom,
    broadcastNewGame,
    leaveGame,
    players,
    gameStatus,
    gameSettings,
    isHost,
    shareCode,
    isRoomClosed,
    newGameId,
    hydrated,
    raceSeconds,
    raceStartedAt: startedAtMs,
    raceFinishTimes,
    finishRace,
  };
}
