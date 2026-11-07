import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePuzzle } from "../hooks/usePuzzle";
import { tStatic } from "../i18n/i18n";
import { track } from "../lib/analytics";
import { extractPuzzleFromUrl, hasImportHash } from "../lib/puzzleUrl";
import { decodeChallengeParams, loadChallenge, saveChallenge, clearChallenge, type ChallengePayload } from "../lib/challenge";
import { loadMpSession } from "../lib/sessionPersistence";
import { loadPlayerName } from "../lib/playerName";
import type { PendingDailyResult } from "../lib/dailyLeaderboard";
import { loadSoloTimer, puzzleIdentity } from "../lib/soloStats";
import { clearProgress, filledCells, getProgress, saveAttempt, whiteCellCount, type SaveAttemptResult } from "../lib/soloProgress";
import { requestSoloStart, rememberSoloLanding } from "../lib/soloSession";
import { useSoloSettings } from "../lib/soloSettings";
import type { Puzzle, CellState, CellCoord, Direction, PuzzleClue } from "../types/puzzle";
import type { RaceMode } from "../types/game";
import type { Claim, PuzzleAction, Rejection } from "../hooks/usePuzzle";

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
  /** The reducer's last refused letter (autocheck on); see `PuzzleState.rejection`. */
  rejection: Rejection | null;
  /** The letters the reducer accepted under a player's id, with their squares; see `PuzzleState.claims`. */
  claims: Claim[];
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
  restoringSolo: boolean;
  hasJoinCode: boolean;
  /** The `?join=` code the page was opened with, until the join screen consumes it. */
  initialJoinCode: string | null;
  /** The join screen took the code: a later visit to Join must not offer it again. */
  consumeInitialJoinCode: () => void;

  checkpointSolo: () => SaveAttemptResult;
  soloSaveError: Exclude<SaveAttemptResult, "saved"> | null;
  // Solo puzzle handlers
  handleSoloPuzzleLoaded: (p: Puzzle, fileBuffer?: ArrayBuffer) => Promise<boolean>;
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

  const [restoringSolo, setRestoringSolo] = useState(!!initialSavedSession?.puzzle);

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

  const [soloSaveError, setSoloSaveError] = useState<Exclude<SaveAttemptResult, "saved"> | null>(null);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const restoredRef = useRef(false);

  // Read once from the page's URL and handed to the join screen once: kept
  // for the page's life, it prefilled every later visit to Join with the
  // first invite's code (a finished room, on the second race of the night).
  const [initialJoinCode, setInitialJoinCode] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code && code.length === 6) {
      return code.toUpperCase();
    }
    return null;
  });
  const consumeInitialJoinCode = useCallback(() => setInitialJoinCode(null), []);

  const hasSavedSoloSession = !!initialSavedSession?.puzzle;
  const hasJoinCode = !!initialJoinCode;
  const hasImportHashOnLoad = useMemo(() => hasImportHash(), []);

  // Restore solo session from localStorage on mount (one-time)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    setRestoringSolo(false);

    // Only restore if no URL params redirect us
    if (initialJoinCode) return;

    const saved = loadSavedSession();
    if (saved?.puzzle) {
      const progress = getProgress(puzzleIdentity(saved.puzzle));
      loadPuzzle(saved.puzzle);
      setSoloTheme(progress?.theme ?? null);
      if (progress?.challenge) saveChallenge(progress.challenge);
      if (progress?.selectedCell) dispatch({ type: "SELECT_CELL", ...progress.selectedCell });
      if (progress?.direction) dispatch({ type: "SET_DIRECTION", direction: progress.direction });
      const restoredCells = progress?.cells ?? saved.playerCells;
      if (restoredCells && Object.keys(restoredCells).length > 0) {
        const cellScore = Object.values(restoredCells).filter((c) => c.correct).length;
        dispatch({ type: "HYDRATE_CELLS", cells: restoredCells, score: cellScore });
      }
    }
  }, [loadPuzzle, dispatch, initialJoinCode]);

  const lastCheckpoint = useRef<unknown[]>([]);
  const checkpointSolo = useCallback((): SaveAttemptResult => {
    if (isMultiplayer || !puzzle) return "saved";
    const snapshot = [puzzle, playerCells, isComplete, puzzleHook.selectedCell, puzzleHook.direction, soloTheme, autocheck];
    if (snapshot.every((value, i) => value === lastCheckpoint.current[i])) return "saved";
    const key = puzzleIdentity(puzzle);
    const prev = getProgress(key);
    const challenge = loadChallenge();
    const timer = loadSoloTimer();
    let result: SaveAttemptResult = "saved";
    if (!isComplete) {
      result = saveAttempt({
        ...prev, key, puzzle, cells: filledCells(playerCells),
        elapsedMs: prev?.elapsedMs ?? (timer?.key === key ? timer.elapsedMs : 0),
        updatedAt: Date.now(), filled: Object.keys(filledCells(playerCells)).length,
        total: whiteCellCount(puzzle), selectedCell: puzzleHook.selectedCell,
        direction: puzzleHook.direction, theme: soloTheme,
        challenge: challenge?.key === key ? challenge : prev?.challenge,
        usedFreeTyping: prev?.usedFreeTyping || !autocheck || Object.values(playerCells).some(c => !!c.letter && !c.correct),
        assisted: prev?.assisted || Object.values(playerCells).some(c => c.revealed),
      });
    } else if (!clearProgress(key)) result = "storage";
    // Compatibility pointer for cold launch; unfinished letters live in the
    // per-puzzle store, which is written first and remains recoverable alone.
    if (result === "saved") {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ puzzle, playerCells, gameId })); }
      catch { result = "storage"; }
    }
    if (result === "saved") lastCheckpoint.current = snapshot;
    setSoloSaveError(result === "saved" ? null : result);
    return result;
  }, [isMultiplayer, puzzle, playerCells, isComplete, gameId, puzzleHook.selectedCell, puzzleHook.direction, soloTheme, autocheck]);

  useEffect(() => { checkpointSolo(); }, [checkpointSolo]);

  // Solo puzzle loaded
  const handleSoloPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      // Resume an unfinished attempt at this puzzle (soloProgress.ts): read it
      // before loading, hydrate right after, in the same tick, so the save
      // effect never sees the empty grid in between.
      if (checkpointSolo() !== "saved") return false;
      const key = puzzleIdentity(p);
      const progress = getProgress(key);
      const result = saveAttempt({
        ...progress, key, puzzle: p, cells: progress?.cells ?? {},
        elapsedMs: progress?.elapsedMs ?? 0, updatedAt: Date.now(),
        filled: progress?.filled ?? 0, total: whiteCellCount(p),
      });
      if (result !== "saved") { setSoloSaveError(result); return false; }
      setSoloSaveError(null);
      requestSoloStart(key);
      rememberSoloLanding("play");
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
      setSoloTheme(progress?.theme ?? null);
      if (progress?.selectedCell) dispatch({ type: "SELECT_CELL", ...progress.selectedCell });
      if (progress?.direction) dispatch({ type: "SET_DIRECTION", direction: progress.direction });
      const incomingChallenge = loadChallenge();
      if (incomingChallenge?.key !== key) {
        if (progress?.challenge) saveChallenge(progress.challenge);
        else clearChallenge();
      }

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
      return true;
    },
    [loadPuzzle, dispatch, checkpointSolo],
  );

  const value: GameContextValue = {
    ...puzzleHook,
    checkpointSolo,
    soloSaveError,
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
    restoringSolo,
    hasJoinCode,
    initialJoinCode,
    consumeInitialJoinCode,
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
