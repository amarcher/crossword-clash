import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePuzzle } from "../hooks/usePuzzle";
import { useAuth } from "./AuthContext";
import {
  uploadPuzzle,
  createGame,
  updateGame,
} from "../lib/puzzleService";
import { tStatic } from "../i18n/i18n";
import { extractPuzzleFromUrl, hasImportHash } from "../lib/puzzleUrl";
import { loadMpSession } from "../lib/sessionPersistence";
import type { Puzzle, CellState, CellCoord, Direction, PuzzleClue } from "../types/puzzle";
import type { PuzzleAction } from "../hooks/usePuzzle";

const STORAGE_KEY = "crossword-clash-solo";

function loadSavedSession(): { puzzle: Puzzle; playerCells: Record<string, CellState>; gameId: string | null } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

interface GameContextValue {
  // Puzzle state
  puzzle: Puzzle | null;
  playerCells: Record<string, CellState>;
  selectedCell: CellCoord | null;
  direction: Direction;
  highlightedCells: Set<string>;
  activeClue: PuzzleClue | null;
  score: number;
  totalWhiteCells: number;
  isComplete: boolean;
  dispatch: React.Dispatch<PuzzleAction>;
  loadPuzzle: (puzzle: Puzzle) => void;
  selectCell: (row: number, col: number) => void;
  toggleDirection: () => void;
  setDirection: (direction: Direction) => void;
  inputLetter: (letter: string, playerId?: string) => void;
  deleteLetter: () => void;
  moveSelection: (dr: number, dc: number) => void;
  nextWord: () => void;
  prevWord: () => void;
  reset: () => void;

  // Game metadata
  gameId: string | null;
  setGameId: (id: string | null) => void;
  isMultiplayer: boolean;
  setIsMultiplayer: (v: boolean) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  urlPuzzle: Puzzle | null;
  setUrlPuzzle: (p: Puzzle | null) => void;
  wrongAnswerTimeout: number;
  setWrongAnswerTimeout: (v: number) => void;
  lockedUntil: number;
  setLockedUntil: (v: number) => void;
  completionModalDismissed: boolean;
  setCompletionModalDismissed: (v: boolean) => void;
  clueSheetOpen: boolean;
  setClueSheetOpen: (v: boolean) => void;
  importFailed: boolean;
  setImportFailed: (v: boolean) => void;
  fileBufferRef: React.RefObject<ArrayBuffer | null>;

  // Derived helpers
  initialMpSession: ReturnType<typeof loadMpSession>;
  initialUrlPuzzle: Puzzle | null;
  hasSavedSoloSession: boolean;
  hasJoinCode: boolean;
  initialJoinCode: string | null;

  // Solo puzzle handlers
  handleSoloPuzzleLoaded: (p: Puzzle, fileBuffer?: ArrayBuffer) => Promise<void>;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const puzzleHook = usePuzzle();
  const {
    puzzle,
    playerCells,
    score,
    isComplete,
    dispatch,
    loadPuzzle,
  } = puzzleHook;

  // Compute initial state from URL params / localStorage (synchronous, no effects)
  const mpSession = useMemo(() => loadMpSession(), []);

  const [urlPuzzle, setUrlPuzzle] = useState<Puzzle | null>(() =>
    window.location.hash.startsWith("#puzzle=") ? extractPuzzleFromUrl() : null,
  );

  const initialSavedSession = useMemo(() => loadSavedSession(), []);

  const [gameId, setGameId] = useState<string | null>(() => {
    if (mpSession) return mpSession.gameId;
    return initialSavedSession?.gameId ?? null;
  });
  const [isMultiplayer, setIsMultiplayer] = useState(() => !!mpSession);
  const [displayName, setDisplayName] = useState(() => mpSession?.displayName ?? tStatic('common.defaultPlayerName'));
  const [clueSheetOpen, setClueSheetOpen] = useState(false);
  const [completionModalDismissed, setCompletionModalDismissed] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [wrongAnswerTimeout, setWrongAnswerTimeout] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const restoredRef = useRef(false);

  const initialJoinCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code && code.length === 6) {
      return code.toUpperCase();
    }
    return null;
  }, []);

  const hasSavedSoloSession = !!initialSavedSession?.puzzle;
  const hasJoinCode = !!initialJoinCode;
  const hasImportHashOnLoad = useMemo(() => hasImportHash(), []);

  // Restore solo session from localStorage on mount (one-time)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Only restore if no URL params redirect us
    if (initialJoinCode) return;

    const saved = loadSavedSession();
    if (saved?.puzzle) {
      loadPuzzle(saved.puzzle);
      if (saved.playerCells && Object.keys(saved.playerCells).length > 0) {
        const cellScore = Object.values(saved.playerCells).filter((c) => c.correct).length;
        dispatch({ type: "HYDRATE_CELLS", cells: saved.playerCells, score: cellScore });
      }
    }
  }, [loadPuzzle, dispatch, initialJoinCode]);

  // Save solo session to localStorage when state changes
  useEffect(() => {
    if (isMultiplayer || !puzzle) return;
    // Only persist when the user is actively playing solo
    // Check if we have a hash (meaning we're in a URL-based flow, not playing yet)
    const data = { puzzle, playerCells, gameId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [puzzle, playerCells, gameId, isMultiplayer]);

  // Persist game state to Supabase when cells change (solo mode only)
  useEffect(() => {
    if (!gameId || !user || isMultiplayer) return;
    const status = isComplete ? "completed" : "active";
    updateGame(gameId, playerCells, status, score, user.id);
  }, [gameId, user, playerCells, score, isComplete, isMultiplayer]);

  // Solo puzzle loaded
  const handleSoloPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      loadPuzzle(p);
      fileBufferRef.current = fileBuffer ?? null;

      if (!user) return;
      const puzzleId = await uploadPuzzle(p, fileBuffer);
      if (!puzzleId) return;
      const result = await createGame(puzzleId, user.id);
      if (result) setGameId(result.gameId);
    },
    [loadPuzzle, user],
  );

  const value: GameContextValue = {
    ...puzzleHook,
    gameId,
    setGameId,
    isMultiplayer,
    setIsMultiplayer,
    displayName,
    setDisplayName,
    urlPuzzle,
    setUrlPuzzle,
    wrongAnswerTimeout,
    setWrongAnswerTimeout,
    lockedUntil,
    setLockedUntil,
    completionModalDismissed,
    setCompletionModalDismissed,
    clueSheetOpen,
    setClueSheetOpen,
    importFailed,
    setImportFailed,
    fileBufferRef,
    initialMpSession: mpSession,
    initialUrlPuzzle: urlPuzzle,
    hasSavedSoloSession,
    hasJoinCode,
    initialJoinCode,
    handleSoloPuzzleLoaded,
  };

  // Suppress unused var warnings: these values are used through the contexts
  void hasImportHashOnLoad;

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used within GameProvider");
  return ctx;
}

// Re-export for convenience
export { loadSavedSession, STORAGE_KEY };
