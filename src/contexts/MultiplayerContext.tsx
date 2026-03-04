import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useGame } from "./GameContext";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { getCompletedClues, getCompletedCluesByPlayer, countCluesPerPlayer } from "../lib/gridUtils";
import { saveMpSession, clearMpSession } from "../lib/sessionPersistence";
import type { Player, GameSettings } from "../types/game";
import type { PlayerResult } from "../components/CompletionModal";

interface MultiplayerContextValue {
  // Core multiplayer hook return
  claimCell: (row: number, col: number, letter: string) => void;
  startGame: (settings?: GameSettings) => Promise<void>;
  closeRoom: () => Promise<void>;
  broadcastNewGame: (newGameId: string) => void;
  leaveGame: () => void;
  players: Player[];
  gameStatus: "waiting" | "active" | "completed";
  gameSettings: GameSettings;
  isHost: boolean;
  shareCode: string | null;
  isRoomClosed: boolean;
  newGameId: string | null;
  hydrated: boolean;

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
  setRejectedCell: (v: string | null) => void;
  triggerReject: (row: number, col: number) => void;

  // Input wrappers
  soloInputLetter: (letter: string) => void;
  multiplayerInputLetter: (letter: string) => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const game = useGame();
  const {
    puzzle,
    playerCells,
    selectedCell,
    totalWhiteCells,
    isComplete,
    dispatch,
    isMultiplayer,
    gameId,
    displayName,
    lockedUntil,
    setLockedUntil,
    inputLetter,
  } = game;

  const [rejectedCell, setRejectedCell] = useState<string | null>(null);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const triggerReject = useCallback((row: number, col: number) => {
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

  // Save multiplayer session to localStorage
  useEffect(() => {
    if (!isMultiplayer || !gameId) return;
    saveMpSession({ gameId, shareCode: multiplayer.shareCode, displayName });
  }, [isMultiplayer, gameId, multiplayer.shareCode, displayName]);

  // Clear MP session when game completes
  useEffect(() => {
    if (multiplayerActive && multiplayer.gameStatus === "completed") {
      clearMpSession();
    }
  }, [multiplayerActive, multiplayer.gameStatus]);

  // Build playerColorMap
  const playerColorMap = useMemo(() => {
    if (!multiplayerActive) return undefined;
    const map: Record<string, string> = {};
    for (const p of multiplayer.players) {
      map[p.userId] = p.color;
    }
    return map;
  }, [multiplayerActive, multiplayer.players]);

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
        ? multiplayer.players.map((p) => ({
            ...p,
            score: scoreByPlayer.get(p.userId) ?? 0,
          }))
        : [],
    [multiplayerActive, multiplayer.players, scoreByPlayer],
  );

  const playerResults: PlayerResult[] | undefined = useMemo(() => {
    if (!multiplayerActive) return undefined;
    return multiplayer.players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      color: p.color,
      cellsClaimed: scoreByPlayer.get(p.userId) ?? 0,
      cluesCompleted: clueCountsByPlayer.get(p.userId) ?? 0,
    }));
  }, [multiplayerActive, multiplayer.players, scoreByPlayer, clueCountsByPlayer]);

  // Solo input wrapper
  const soloInputLetter = useCallback(
    (letter: string) => {
      if (!puzzle || !selectedCell) return;
      const { row, col } = selectedCell;
      const cell = puzzle.cells[row]?.[col];
      if (!cell || cell.solution === null) return;

      if (playerCells[`${row},${col}`]?.correct) {
        inputLetter(letter);
        return;
      }

      if (letter.toUpperCase() !== cell.solution) {
        triggerReject(row, col);
        return;
      }
      inputLetter(letter);
    },
    [puzzle, selectedCell, playerCells, inputLetter, triggerReject],
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
        multiplayer.claimCell(row, col, letter);
        return;
      }

      if (letter.toUpperCase() !== cell.solution) {
        triggerReject(row, col);
        const timeoutMs = multiplayer.gameSettings.wrongAnswerTimeoutSeconds * 1000;
        if (timeoutMs > 0) {
          setLockedUntil(Date.now() + timeoutMs);
        }
        return;
      }
      multiplayer.claimCell(row, col, letter);
    },
    [multiplayerActive, selectedCell, puzzle, playerCells, multiplayer, triggerReject, lockedUntil, setLockedUntil],
  );

  // Suppress lint warnings for derived values that are consumed downstream
  void isComplete;

  const value: MultiplayerContextValue = {
    ...multiplayer,
    multiplayerActive,
    playerColorMap,
    completedClues,
    completedCluesByPlayer,
    clueCountsByPlayer,
    scoreByPlayer,
    multiplayerPlayers,
    playerResults,
    rejectedCell,
    setRejectedCell,
    triggerReject,
    soloInputLetter,
    multiplayerInputLetter,
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
