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
import { reportError } from "../lib/errorReporting";
import { displayableName } from "../lib/nameFilter";
import { DEFAULT_GAME_SETTINGS, resolveRaceMode } from "../lib/gameSettings";
import { buildFinalStandings, mergeRosters, type FinalStandings } from "../lib/finalStandings";
import { liveRoster } from "../lib/roster";

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
        displayName: displayableName(p.display_name),
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
  /**
   * The name this player typed (GameContext.displayName): the one source for
   * their own roster row and presence entry. The DB row and the presence
   * payload are copies of it, so neither can show an older name of theirs.
   * Omitted by a spectator, who has no row and never tracks.
   */
  displayName?: string;
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
  /**
   * The frozen record of the finished game (finalStandings.ts): every player
   * who was in it, their colour, squares and finish time, and the winner.
   * Taken once when the room completes (or when a completed room is
   * hydrated) from the claimed cells plus the presence AND DB rosters, and
   * never touched by presence again — so a partner who leaves after the
   * finish keeps their row. Null while the game is in progress.
   */
  finalStandings: FinalStandings | null;
}

export function useMultiplayer({
  gameId,
  userId,
  puzzle,
  dispatch,
  playerCells,
  totalWhiteCells,
  displayName,
  onCellClaimed,
  onWrongLetter,
}: UseMultiplayerOptions): UseMultiplayerReturn {
  const [players, setPlayers] = useState<Player[]>([]);
  // Room status and "hydrated" are keyed by the room they describe: this hook
  // lives in the app-wide provider, so after one game a new room would
  // otherwise be read with the previous game's "active" / hydrated for the
  // first render, and the lobby would jump straight to /play (1.1.0 report:
  // "Create room" opened the puzzle instead of the invite page).
  const [statusState, setStatusState] = useState<{ gameId: string | null; status: "waiting" | "active" | "completed" }>({ gameId: null, status: "waiting" });
  const gameStatus = statusState.gameId === gameId ? statusState.status : "waiting";
  const setGameStatus = useCallback((status: "waiting" | "active" | "completed") => setStatusState({ gameId, status }), [gameId]);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isRoomClosed, setIsRoomClosed] = useState(false);
  const [newGameId, setNewGameId] = useState<string | null>(null);
  const [gameSettings, setGameSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const hydrated = hydratedFor !== null && hydratedFor === gameId;
  // Race clock (ms epoch). Seeded by broadcast timestamps for live clients and
  // by the DB's started_at/completed_at on hydrate, so refreshes keep the time.
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [completedAtMs, setCompletedAtMs] = useState<number | null>(null);
  // Async ("time trial") mode: per-player finish times, userId → seconds.
  const [raceFinishTimes, setRaceFinishTimes] = useState<Record<string, number>>({});
  // The finished game's record, keyed by room like statusState so a new room
  // never reads the last game's standings.
  const [finalState, setFinalState] = useState<{ gameId: string; standings: FinalStandings } | null>(null);
  const finalStandings = finalState !== null && finalState.gameId === gameId ? finalState.standings : null;
  // The DB `players` rows from the last hydrate: the roster that outlives
  // presence, so the record lists a player who has already dropped.
  const dbPlayersRef = useRef<Player[]>([]);
  // The last non-empty presence roster, null until presence has warmed (an
  // empty sync before then is our own track() not landed yet; after it, an
  // empty sync means everyone legitimately left).
  const presenceRef = useRef<Player[] | null>(null);
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;
  // Claims whose server round trip has not answered yet, and a tick for each
  // answer. The finish waits for them: the optimistic last letter completes
  // the local grid before `claim_cell` has run, and marking the game
  // completed in that same tick made the RPC refuse that very claim (it only
  // claims in an `active` game) — the finisher's last square rolled back and
  // the DB kept one cell fewer than the grid.
  const pendingClaimsRef = useRef(0);
  const [claimsSettled, setClaimsSettled] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const playerCellsRef = useRef(playerCells);
  playerCellsRef.current = playerCells;
  const onCellClaimedRef = useRef(onCellClaimed);
  onCellClaimedRef.current = onCellClaimed;
  const onWrongLetterRef = useRef(onWrongLetter);
  onWrongLetterRef.current = onWrongLetter;
  // What this client last tracked into presence (null for a spectator, or
  // after an intentional leave). Re-sent whenever the channel (re)subscribes
  // or the page comes back, because realtime-js does not replay it: a phone
  // that locks drops the socket, the server forgets the presence, and the
  // rejoin alone would leave this player missing from everyone's roster.
  const trackedRef = useRef<TrackedPresence | null>(null);

  // `players` is always derived from the two sources through liveRoster:
  // presence membership once warmed (DB rows before), DB order, the typed
  // name on this player's row. Hydrate and sync both go through here, so
  // neither can rename or reorder what the other showed.
  const refreshRoster = useCallback(() => {
    const typed = displayNameRef.current;
    setPlayers(liveRoster(presenceRef.current, dbPlayersRef.current, typed !== undefined ? { userId, displayName: typed } : undefined));
  }, [userId]);

  // Track this client into presence from its DB row (colour) and the typed
  // name, the first time the row is seen. SUBSCRIBED fires again after every
  // reconnect, and the server has forgotten us by then, so the subscribe
  // handler re-sends `trackedRef` each time rather than tracking once.
  const trackSelf = useCallback((rows: Player[]) => {
    if (trackedRef.current || !userId) return;
    const self = rows.find((p) => p.userId === userId);
    if (!self) return;
    const typed = displayNameRef.current?.trim() ? displayNameRef.current : self.displayName;
    const payload = { user_id: userId, display_name: displayableName(typed), color: self.color } satisfies TrackedPresence;
    trackedRef.current = payload;
    void channelRef.current?.track(payload);
  }, [userId]);

  // Hydrate state from DB — returns fetched state for callers
  const hydrate = useCallback(async () => {
    if (!gameId) return null;
    const state = await fetchGameState(gameId);
    if (!state) return null;

    dbPlayersRef.current = state.players;
    refreshRoster();
    // Our own row may land after the first hydrate (the rejoin that follows
    // a "next puzzle" inserts it while the channel is already up): track as
    // soon as a hydrate finds it, not only on SUBSCRIBED.
    trackSelf(state.players);
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
  }, [gameId, userId, dispatch, setGameStatus, refreshRoster, trackSelf]);

  // Subscribe to Broadcast channel
  useEffect(() => {
    if (!supabase || !gameId) return;

    setHydratedFor(null);
    trackedRef.current = null;
    presenceRef.current = null;
    // The rest of the previous room's state goes too, so a new lobby never
    // shows the last roster, clock or settings while this room loads.
    setPlayers([]);
    dbPlayersRef.current = [];
    setShareCode(null);
    setStartedAtMs(null);
    setCompletedAtMs(null);
    setRaceFinishTimes({});
    setGameSettings(DEFAULT_GAME_SETTINGS);

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
      // An empty sync before presence has warmed is our own track() not
      // landed yet: keep the DB bootstrap in place (no blank-then-fill
      // flash). Once warmed, an empty sync means everyone legitimately left.
      if (fromPresence.length > 0 || presenceRef.current !== null) presenceRef.current = fromPresence;
      refreshRoster();
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

    channel.subscribe(async (status, err) => {
      if (status === "CHANNEL_ERROR") {
        reportError(err ?? new Error("Realtime channel error"), { op: "realtime subscribe", gameId });
      }
      if (status === "SUBSCRIBED") {
        // A reconnect: the server forgot our presence while the socket was
        // down, so re-send what we tracked. The first time, hydrate tracks
        // us from our DB row (trackSelf); a spectator has no row and stays
        // invisible.
        const tracked = trackedRef.current;
        await hydrate();
        setHydratedFor(gameId);
        if (tracked) await channel.track(tracked);
      }
    });

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [gameId, userId, dispatch, hydrate, setGameStatus, refreshRoster]);

  // Tab wake: re-hydrate from the DB and make sure we are still in presence
  // (a socket that died while the page was hidden took our entry with it).
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      void hydrate();
      const tracked = trackedRef.current;
      if (tracked) void channelRef.current?.track(tracked);
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
    // Only once every claim of ours has been answered (see pendingClaimsRef).
    if (pendingClaimsRef.current > 0) return;
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
          .then(({ error }) => {
            if (error) reportError(error, { op: "mark game completed", gameId });
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
  }, [playerCells, totalWhiteCells, gameStatus, gameId, gameSettings, setGameStatus, claimsSettled]);

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
        .then(({ error }) => {
          if (error) reportError(error, { op: "mark async game completed", gameId });
          void channelRef.current
            ?.send({ type: "broadcast", event: "game_completed", payload: { completedAt } })
            .catch(() => {});
        });
    }
  }, [gameStatus, gameSettings, players, raceFinishTimes, gameId, setGameStatus]);

  // Freeze the record the moment the room is complete. The claimed cells
  // carry their claimants; the roster is presence merged with the DB rows,
  // so a player who already left is still listed with the colour they had.
  // A shared grid waits for its last claim (the `game_completed` broadcast
  // can overtake the final `cell_claimed`); a hydrated completed room gets
  // the record from the DB's cells and rows on the same path. Presence
  // changes after this never touch it: the state is only ever set once per
  // room id.
  useEffect(() => {
    if (!gameId || gameStatus !== "completed") return;
    if (finalState !== null && finalState.gameId === gameId) return;
    const mode = resolveRaceMode(gameSettings);
    if (mode !== "async") {
      const filled = Object.values(playerCells).filter((c) => c.correct).length;
      if (totalWhiteCells > 0 && filled < totalWhiteCells) return;
    }
    const roster = mergeRosters(players, dbPlayersRef.current);
    if (roster.length === 0) return;
    setFinalState({ gameId, standings: buildFinalStandings(roster, playerCells, raceFinishTimes, mode) });
  }, [gameId, gameStatus, finalState, gameSettings, playerCells, totalWhiteCells, players, raceFinishTimes]);

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
      pendingClaimsRef.current += 1;
      let success: boolean;
      try {
        success = await claimCellOnServer(gameId, key, letter.toUpperCase(), userId, true);
      } finally {
        pendingClaimsRef.current -= 1;
        setClaimsSettled((n) => n + 1);
      }

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
  }, [gameId, setGameStatus]);

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
    const { error } = await supabase
      .from("games")
      .update({ status: "closed" })
      .eq("id", gameId);
    if (error) reportError(error, { op: "close room", gameId });
  }, [gameId]);

  // Untrack presence on intentional leave; Supabase fires presence.leave
  // on other clients within ~1s. Channel teardown happens in the
  // subscribe effect's cleanup.
  const leaveGame = useCallback(async () => {
    trackedRef.current = null;
    await channelRef.current?.untrack();
  }, []);

  // Defense-in-depth on tab close: force untrack early so other clients
  // GC us faster than Supabase's own dead-socket detection. Fire-and-forget
  // because the page is dying. Only on pagehide: a hidden page is not a
  // closed one (a locked phone, a notification, another tab), and untracking
  // there made the host vanish from the lobby every time their phone locked.
  useEffect(() => {
    if (!gameId) return;
    function fireUntrack() {
      channelRef.current?.untrack();
    }
    window.addEventListener("pagehide", fireUntrack);
    return () => window.removeEventListener("pagehide", fireUntrack);
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
    finalStandings,
  };
}
