import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useGame } from "./GameContext";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { getCompletedClues, getCompletedCluesByPlayer, countCluesPerPlayer } from "../lib/gridUtils";
import { saveMpSession, clearMpSession, touchMpSession } from "../lib/sessionPersistence";
import { resolveRaceMode } from "../lib/gameSettings";
import type { Player, GameSettings, RaceMode } from "../types/game";
import type { PlayerResult } from "../components/CompletionModal";
import type { FinalStandings } from "../lib/finalStandings";

interface MultiplayerContextValue {
  // Core multiplayer hook return
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
  /** Shared race time in whole seconds once the game completes, else null. */
  raceSeconds: number | null;
  /** ms epoch when the host released the players, or null while waiting. */
  raceStartedAt: number | null;
  /** Async mode: userId → finish seconds for players who finished. */
  raceFinishTimes: Record<string, number>;
  /** Async mode: record + broadcast the local player's finish. */
  finishRace: () => number | null;
  /** The room's play mode (defaults to "versus" for legacy games). */
  raceMode: RaceMode;
  /** The finished game's frozen record (see useMultiplayer); null while in progress. */
  finalStandings: FinalStandings | null;

  // Derived values
  multiplayerActive: boolean;
  playerColorMap: Record<string, string> | undefined;
  completedClues: Set<string>;
  completedCluesByPlayer: Map<string, { playerId: string }> | undefined;
  clueCountsByPlayer: Map<string, number>;
  scoreByPlayer: Map<string, number>;
  multiplayerPlayers: (Player & { score: number })[];
  playerResults: PlayerResult[] | undefined;
  rejectedCell: string | null;
  /** Wrong letters typed this session; counts every one, however fast. */
  wrongLetters: number;
  /**
   * "row,col" keys of the current puzzle's cells that took a wrong letter at
   * least once — the share block paints them red. Reset per puzzle.
   */
  wrongCells: string[];
  setRejectedCell: (v: string | null) => void;
  triggerReject: (row: number, col: number) => void;

  // Input wrappers
  soloInputLetter: (letter: string) => void;
  multiplayerInputLetter: (letter: string) => void;
  /**
   * Async ("time trial") input: validates against the local copy only — no
   * server claim, no broadcast. Honors the wrong-answer lockout so the host's
   * penalty setting stays fair across modes.
   */
  asyncInputLetter: (letter: string) => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const game = useGame();
  const {
    puzzle,
    playerCells,
    selectedCell,
    direction,
    totalWhiteCells,
    isComplete,
    dispatch,
    isMultiplayer,
    gameId,
    displayName,
    lockedUntil,
    setLockedUntil,
    inputLetter,
    autocheck,
  } = game;

  const [rejectedCell, setRejectedCell] = useState<string | null>(null);
  const [wrongLetters, setWrongLetters] = useState(0);
  const [wrongCells, setWrongCells] = useState<string[]>([]);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // A new puzzle starts with a clean sheet of wrong cells.
  useEffect(() => {
    setWrongCells([]);
  }, [puzzle]);

  const triggerReject = useCallback((row: number, col: number) => {
    setWrongLetters((n) => n + 1);
    const key = `${row},${col}`;
    setWrongCells((cells) => (cells.includes(key) ? cells : [...cells, key]));
    if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    setRejectedCell(null);
    requestAnimationFrame(() => {
      setRejectedCell(`${row},${col}`);
      navigator.vibrate?.(50);
      rejectTimerRef.current = setTimeout(() => setRejectedCell(null), 400);
    });
  }, []);

  // Multiplayer hook
  const multiplayer = useMultiplayer(
    isMultiplayer && gameId && puzzle && user
      ? {
          gameId,
          userId: user.id,
          puzzle,
          dispatch,
          playerCells,
          totalWhiteCells,
          displayName,
        }
      : {
          gameId: "",
          userId: "",
          puzzle: { cells: [] },
          dispatch: () => {},
          playerCells: {},
          totalWhiteCells: 0,
        },
  );

  const multiplayerActive = isMultiplayer && gameId !== null;

  // Save multiplayer session to localStorage. A finished game is never
  // re-saved (signing the leaderboard after a race changes displayName).
  useEffect(() => {
    if (!isMultiplayer || !gameId || multiplayer.gameStatus === "completed") return;
    saveMpSession({ gameId, shareCode: multiplayer.shareCode, displayName });
  }, [isMultiplayer, gameId, multiplayer.shareCode, displayName, multiplayer.gameStatus]);

  // Clear MP session when game completes
  useEffect(() => {
    if (multiplayerActive && multiplayer.gameStatus === "completed") {
      clearMpSession();
    }
  }, [multiplayerActive, multiplayer.gameStatus]);

  // Keep the session's `savedAt` current while the player is in the room, so a
  // cold start can tell a lobby they just backgrounded from one abandoned hours
  // ago (sessionPersistence: 12 h hard expiry, 1 h for auto-rejoining a lobby).
  useEffect(() => {
    if (!multiplayerActive || multiplayer.gameStatus === "completed") return;
    const id = window.setInterval(() => touchMpSession(), 60_000);
    const onHide = () => {
      if (document.visibilityState === "hidden") touchMpSession();
    };
    const onPageHide = () => touchMpSession();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [multiplayerActive, multiplayer.gameStatus]);

  // The roster the finished screens read: the frozen record once the game is
  // over (finalStandings.ts — a partner who leaves keeps their row, colour and
  // squares), the live presence roster while it is in progress.
  const { finalStandings } = multiplayer;
  const roster = useMemo<Pick<Player, "userId" | "displayName" | "color">[]>(
    () => finalStandings?.players ?? multiplayer.players,
    [finalStandings, multiplayer.players],
  );

  // Build playerColorMap
  const playerColorMap = useMemo(() => {
    if (!multiplayerActive) return undefined;
    const map: Record<string, string> = {};
    for (const p of roster) {
      map[p.userId] = p.color;
    }
    return map;
  }, [multiplayerActive, roster]);

  const completedClues = useMemo(
    () => (puzzle ? getCompletedClues(puzzle, playerCells) : new Set<string>()),
    [puzzle, playerCells],
  );

  const completedCluesByPlayer = useMemo(
    () => (puzzle && multiplayerActive ? getCompletedCluesByPlayer(puzzle, playerCells) : undefined),
    [puzzle, playerCells, multiplayerActive],
  );

  const clueCountsByPlayer = useMemo(
    () => (completedCluesByPlayer ? countCluesPerPlayer(completedCluesByPlayer) : new Map<string, number>()),
    [completedCluesByPlayer],
  );

  const scoreByPlayer = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of Object.values(playerCells)) {
      if (c.correct && c.playerId) {
        counts.set(c.playerId, (counts.get(c.playerId) ?? 0) + 1);
      }
    }
    return counts;
  }, [playerCells]);

  const multiplayerPlayers = useMemo(
    () =>
      multiplayerActive
        ? finalStandings
          ? finalStandings.players.map((p) => ({
              id: p.userId,
              gameId: gameId ?? "",
              userId: p.userId,
              displayName: p.displayName,
              color: p.color,
              score: p.cellsClaimed,
              raceSeconds: p.raceSeconds,
            }))
          : multiplayer.players.map((p) => ({
              ...p,
              score: scoreByPlayer.get(p.userId) ?? 0,
            }))
        : [],
    [multiplayerActive, finalStandings, gameId, multiplayer.players, scoreByPlayer],
  );

  const playerResults: PlayerResult[] | undefined = useMemo(() => {
    if (!multiplayerActive) return undefined;
    return multiplayerPlayers.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      color: p.color,
      cellsClaimed: p.score,
      cluesCompleted: clueCountsByPlayer.get(p.userId) ?? 0,
    }));
  }, [multiplayerActive, multiplayerPlayers, clueCountsByPlayer]);

  // Solo input wrapper. With Autocheck on (soloSettings.ts) a wrong letter is
  // refused here — the square flashes, nothing is written, the miss is
  // counted; off, every letter goes straight to the reducer, which writes it
  // as typed and leaves the judging to Check / the finish.
  const soloInputLetter = useCallback(
    (letter: string) => {
      if (!puzzle || !selectedCell) return;
      const { row, col } = selectedCell;
      const cell = puzzle.cells[row]?.[col];
      if (!cell || cell.solution === null) return;

      if (!autocheck || playerCells[`${row},${col}`]?.correct) {
        inputLetter(letter);
        return;
      }

      if (letter.toUpperCase() !== cell.solution) {
        triggerReject(row, col);
        return;
      }
      inputLetter(letter);
    },
    [puzzle, selectedCell, playerCells, inputLetter, triggerReject, autocheck],
  );

  // Multiplayer input wrapper
  const multiplayerInputLetter = useCallback(
    (letter: string) => {
      if (!multiplayerActive || !selectedCell || !puzzle) return;
      if (Date.now() < lockedUntil) return;

      const { row, col } = selectedCell;
      const cell = puzzle.cells[row]?.[col];
      if (!cell || cell.solution === null) return;

      if (playerCells[`${row},${col}`]?.correct) {
        // Cell already claimed (e.g. by another player) — just advance cursor
        inputLetter(letter);
        return;
      }

      if (letter.toUpperCase() !== cell.solution) {
        triggerReject(row, col);
        multiplayer.broadcastWrongLetter(row, col, cell.solution, letter, direction);
        const timeoutMs = multiplayer.gameSettings.wrongAnswerTimeoutSeconds * 1000;
        if (timeoutMs > 0) {
          // Math.max so a second wrong letter cannot shorten an active lockout.
          setLockedUntil(Math.max(lockedUntil, Date.now() + timeoutMs));
        }
        return;
      }
      multiplayer.claimCell(row, col, letter);
    },
    [multiplayerActive, selectedCell, puzzle, playerCells, direction, multiplayer, triggerReject, lockedUntil, setLockedUntil, inputLetter],
  );

  // Async ("time trial") input: exactly the shared-grid flow minus the server
  // claim/broadcast — the grid is the local player's own copy. Wrong letters
  // still reject + apply the host's lockout penalty, and are NOT broadcast
  // (nobody else can see this grid).
  const asyncInputLetter = useCallback(
    (letter: string) => {
      if (!multiplayerActive || !selectedCell || !puzzle) return;
      if (Date.now() < lockedUntil) return;

      const { row, col } = selectedCell;
      const cell = puzzle.cells[row]?.[col];
      if (!cell || cell.solution === null) return;

      if (playerCells[`${row},${col}`]?.correct) {
        // Already solved locally — just advance the cursor.
        inputLetter(letter);
        return;
      }

      if (letter.toUpperCase() !== cell.solution) {
        triggerReject(row, col);
        const timeoutMs = multiplayer.gameSettings.wrongAnswerTimeoutSeconds * 1000;
        if (timeoutMs > 0) {
          setLockedUntil(Math.max(lockedUntil, Date.now() + timeoutMs));
        }
        return;
      }
      // Tag with the local user id so the fill renders in the player's color.
      inputLetter(letter, user?.id);
    },
    [multiplayerActive, selectedCell, puzzle, playerCells, multiplayer, triggerReject, lockedUntil, setLockedUntil, inputLetter, user],
  );

  // Suppress lint warnings for derived values that are consumed downstream
  void isComplete;

  const value: MultiplayerContextValue = {
    ...multiplayer,
    raceMode: resolveRaceMode(multiplayer.gameSettings),
    multiplayerActive,
    playerColorMap,
    completedClues,
    completedCluesByPlayer,
    clueCountsByPlayer,
    scoreByPlayer,
    multiplayerPlayers,
    playerResults,
    rejectedCell,
    wrongLetters,
    wrongCells,
    setRejectedCell,
    triggerReject,
    soloInputLetter,
    multiplayerInputLetter,
    asyncInputLetter,
  };

  return (
    <MultiplayerContext.Provider value={value}>
      {children}
    </MultiplayerContext.Provider>
  );
}

export function useMultiplayerContext(): MultiplayerContextValue {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) throw new Error("useMultiplayerContext must be used within MultiplayerProvider");
  return ctx;
}
