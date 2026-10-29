import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePuzzle } from "../hooks/usePuzzle";
import { tStatic } from "../i18n/i18n";
import { track } from "../lib/analytics";
import { extractPuzzleFromUrl, hasImportHash } from "../lib/puzzleUrl";
import { decodeChallengeParams, type ChallengePayload } from "../lib/challenge";
import { loadMpSession } from "../lib/sessionPersistence";
import { loadPlayerName } from "../lib/playerName";
import type { PendingDailyResult } from "../lib/dailyLeaderboard";
import { loadSoloTimer, puzzleIdentity } from "../lib/soloStats";
import { clearProgress, filledCells, getProgress, recordProgressCells, whiteCellCount } from "../lib/soloProgress";
import { useSoloSettings } from "../lib/soloSettings";
import type { Puzzle, CellState, CellCoord, Direction, PuzzleClue } from "../types/puzzle";
import type { RaceMode } from "../types/game";
import type { PuzzleAction } from "../hooks/usePuzzle";

const STORAGE_KEY = "crossword-clash-solo";
const LOCKOUT_STORAGE_KEY = "crossword-clash:lockedUntil";

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
  /**
   * Whether the reducer refuses wrong letters right now: the device's solo
   * Autocheck setting (soloSettings.ts), forced on in a room. The solo play
   * screen owns the toggle; this is the effective value the grid plays by.
   */
  autocheck: boolean;
  /** Mark the wrong letters among the given squares (solo, autocheck off). */
  checkCells: (cells: CellCoord[]) => void;
  /** Write and lock one square's solution; the finish then counts as assisted. */
  revealCell: (row: number, col: number) => void;

  // Game metadata
  gameId: string | null;
  setGameId: (id: string | null) => void;
  isMultiplayer: boolean;
  setIsMultiplayer: (v: boolean) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  urlPuzzle: Puzzle | null;
  setUrlPuzzle: (p: Puzzle | null) => void;
  /**
   * Theme label for the current solo puzzle, surfaced in the solo header. Set
   * only when the Daily Mini is launched; null for imported / sample puzzles.
   */
  soloTheme: string | null;
  setSoloTheme: (v: string | null) => void;
  /**
   * Challenger name + ghost time captured from a challenge deep link's query
   * string (`?cf=&ct=`). Read from context, never window.location, after init.
   */
  urlChallenge: ChallengePayload | null;
  /** Set by the /daily/:day/:slot route when its link carries a ghost (`?beat=&by=`). */
  setUrlChallenge: (c: ChallengePayload | null) => void;
  wrongAnswerTimeout: number;
  setWrongAnswerTimeout: (v: number) => void;
  /** Lobby-chosen play mode; rides the game_started settings broadcast. */
  raceMode: RaceMode;
  setRaceMode: (v: RaceMode) => void;
  lockedUntil: number;
  setLockedUntil: (v: number) => void;
  completionModalDismissed: boolean;
  setCompletionModalDismissed: (v: boolean) => void;
  /**
   * The daily finish most recently posted from this tab (solo or async race),
   * kept so the leaderboard can await the submission instead of racing it
   * and show the viewer's own row at once. Replaced by each new finish.
   */
  pendingDailyResult: PendingDailyResult | null;
  setPendingDailyResult: React.Dispatch<React.SetStateAction<PendingDailyResult | null>>;
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
  const puzzleHook = usePuzzle();
  const {
    puzzle,
    playerCells,
    isComplete,
    dispatch,
    loadPuzzle,
  } = puzzleHook;
  const { autocheck: autocheckSetting } = useSoloSettings();

  // Compute initial state from URL params / localStorage (synchronous, no effects)
  const mpSession = useMemo(() => loadMpSession(), []);

  // No window during the build-time prerender (src/entry-server.tsx).
  const hasUrlPuzzleOnLoad = typeof window !== "undefined" && window.location.hash.startsWith("#puzzle=");
  const [urlPuzzle, setUrlPuzzle] = useState<Puzzle | null>(() =>
    hasUrlPuzzleOnLoad ? extractPuzzleFromUrl() : null,
  );
  // The query string survives extractPuzzleFromUrl() (which clears only the
  // hash), so a challenge's name+time can still be read from it at init.
  const [urlChallenge, setUrlChallenge] = useState<ChallengePayload | null>(() =>
    hasUrlPuzzleOnLoad ? decodeChallengeParams(window.location.search) : null,
  );

  const [soloTheme, setSoloTheme] = useState<string | null>(null);

  const initialSavedSession = useMemo(() => loadSavedSession(), []);

  const [gameId, setGameId] = useState<string | null>(() => {
    if (mpSession) return mpSession.gameId;
    return initialSavedSession?.gameId ?? null;
  });
  const [isMultiplayer, setIsMultiplayer] = useState(() => !!mpSession);
  // The reducer plays by the device's Autocheck setting in solo and always
  // refuses wrong letters in a room (correct letters lock in there).
  const autocheck = autocheckSetting || isMultiplayer;
  useEffect(() => {
    dispatch({ type: "SET_AUTOCHECK", autocheck });
  }, [autocheck, dispatch]);
  const [displayName, setDisplayName] = useState(
    () => mpSession?.displayName ?? loadPlayerName() ?? tStatic('common.defaultPlayerName'),
  );
  const [clueSheetOpen, setClueSheetOpen] = useState(false);
  // A finished solo puzzle restored at launch has had its celebration already:
  // the play screen opens on the solved grid with the modal closed (its header
  // can re-open it). A fresh finish starts with the modal shown.
  const [completionModalDismissed, setCompletionModalDismissed] = useState(() => {
    const saved = initialSavedSession?.puzzle;
    if (!saved) return false;
    const timer = loadSoloTimer();
    return !!timer?.completed && timer.key === puzzleIdentity(saved);
  });
  const [pendingDailyResult, setPendingDailyResult] = useState<PendingDailyResult | null>(null);
  const [importFailed, setImportFailed] = useState(false);
  const [wrongAnswerTimeout, setWrongAnswerTimeout] = useState(0);
  const [raceMode, setRaceMode] = useState<RaceMode>("versus");

  // Persisted to sessionStorage so a refresh during an active lockout
  // cannot bypass the penalty. sessionStorage (not localStorage) keeps it
  // scoped to this tab — opening a new tab is a fresh start.
  const [lockedUntil, setLockedUntilState] = useState<number>(() => {
    if (typeof sessionStorage === "undefined") return 0;
    const stored = sessionStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!stored) return 0;
    const parsed = parseInt(stored, 10);
    return Number.isFinite(parsed) && parsed > Date.now() ? parsed : 0;
  });
  const setLockedUntil = useCallback((v: number) => {
    setLockedUntilState(v);
    if (typeof sessionStorage === "undefined") return;
    if (v > Date.now()) {
      sessionStorage.setItem(LOCKOUT_STORAGE_KEY, String(v));
    } else {
      sessionStorage.removeItem(LOCKOUT_STORAGE_KEY);
    }
  }, []);

  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const restoredRef = useRef(false);

  const initialJoinCode = useMemo(() => {
    if (typeof window === "undefined") return null;
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

  // Save solo session to localStorage when state changes. This is the whole
  // of solo persistence: a solo game has no server rows (no puzzles, games or
  // players insert, nothing mirrored per keystroke); `play_sessions` is its
  // only server-side trace (usePlayInsights). The `gameId` kept here is null
  // for solo games since then and only meaningful for a room.
  useEffect(() => {
    if (isMultiplayer || !puzzle) return;
    const data = { puzzle, playerCells, gameId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Per-puzzle progress (soloProgress.ts), so any started puzzle resumes and
    // the archive marks it: the letters while playing, gone once finished. No
    // debounce — the save above already rewrites the whole puzzle per keystroke.
    const key = puzzleIdentity(puzzle);
    if (isComplete) clearProgress(key);
    else recordProgressCells(key, playerCells, whiteCellCount(puzzle));
  }, [puzzle, playerCells, gameId, isMultiplayer, isComplete]);

  // Solo puzzle loaded
  const handleSoloPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      // Resume an unfinished attempt at this puzzle (soloProgress.ts): read it
      // before loading, hydrate right after, in the same tick, so the save
      // effect never sees the empty grid in between.
      const progress = getProgress(puzzleIdentity(p));
      loadPuzzle(p);
      if (progress) {
        const cells = filledCells(progress.cells);
        if (Object.keys(cells).length > 0) {
          dispatch({ type: "HYDRATE_CELLS", cells, score: Object.values(cells).filter((c) => c.correct).length });
        }
      }
      // A solo puzzle has no server game; a room's id must not survive into it.
      setGameId(null);
      setIsMultiplayer(false);
      // A fresh puzzle gets its own finish: the previous modal's dismissal
      // must not hide this one (the finish screen's "Up next" loads the next
      // daily into this same screen).
      setCompletionModalDismissed(false);
      fileBufferRef.current = fileBuffer ?? null;
      // Imported / sample puzzles carry no theme — clear any prior daily theme
      // so a stale "Today's theme" banner never bleeds onto a new puzzle.
      setSoloTheme(null);

      // fileBuffer present ⇒ came from a real file upload (SoloImportScreen).
      // The URL/deep-link path passes no buffer and is reported in
      // PuzzleReadyScreen, so this avoids double-counting.
      if (fileBuffer) {
        track("puzzle_imported", {
          import_source: "file",
          title: p.title,
          size: `${p.width}x${p.height}`,
        });
      }
    },
    [loadPuzzle, dispatch],
  );

  const value: GameContextValue = {
    ...puzzleHook,
    autocheck: puzzleHook.autocheck,
    gameId,
    setGameId,
    isMultiplayer,
    setIsMultiplayer,
    displayName,
    setDisplayName,
    urlPuzzle,
    setUrlPuzzle,
    soloTheme,
    setSoloTheme,
    urlChallenge,
    setUrlChallenge,
    wrongAnswerTimeout,
    setWrongAnswerTimeout,
    raceMode,
    setRaceMode,
    lockedUntil,
    setLockedUntil,
    completionModalDismissed,
    setCompletionModalDismissed,
    pendingDailyResult,
    setPendingDailyResult,
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
