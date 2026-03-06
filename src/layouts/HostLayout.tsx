import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useNavigate } from "react-router";
import { useSupabase } from "../hooks/useSupabase";
import { usePuzzle } from "../hooks/usePuzzle";
import { useMultiplayer } from "../hooks/useMultiplayer";
import { useSpeechSettings } from "../hooks/useSpeechSettings";
import { useNarrator } from "../hooks/useNarrator";
import {
  uploadPuzzle,
  createGame,
  createNextGame,
} from "../lib/puzzleService";
import { loadHostSession, saveHostSession, clearHostSession } from "../lib/sessionPersistence";
import { extractPuzzleFromUrl, hasImportHash } from "../lib/puzzleUrl";
import { getCompletedClues, getCompletedCluesByPlayer, countCluesPerPlayer, getNewlyCompletedClues } from "../lib/gridUtils";
import { buildClueCompletedEvent, buildLeadChangeEvent } from "../lib/narrator/events";
import { tStatic } from "../i18n/i18n";
import { createContext, useContext } from "react";
import type { Puzzle, CellState } from "../types/puzzle";
import type { Player, GameSettings } from "../types/game";
import type { PlayerResult } from "../components/CompletionModal";
import type { SpeechSettings } from "../hooks/useSpeechSettings";
import type { PuzzleAction } from "../hooks/usePuzzle";
import type { AgentGameEvent } from "../lib/narrator/types";

export interface HostContextValue {
  // Auth
  user: ReturnType<typeof useSupabase>["user"];

  // Puzzle state
  puzzle: Puzzle | null;
  playerCells: Record<string, CellState>;
  selectedCell: { row: number; col: number } | null;
  highlightedCells: Set<string>;
  score: number;
  totalWhiteCells: number;
  dispatch: React.Dispatch<PuzzleAction>;
  loadPuzzle: (puzzle: Puzzle) => void;
  selectCell: (row: number, col: number) => void;

  // Host-specific
  gameId: string | null;
  urlPuzzle: Puzzle | null;
  setUrlPuzzle: (p: Puzzle | null) => void;
  importFailed: boolean;
  setImportFailed: (v: boolean) => void;
  wrongAnswerTimeout: number;
  setWrongAnswerTimeout: (v: number) => void;
  completionModalDismissed: boolean;
  setCompletionModalDismissed: (v: boolean) => void;

  // Multiplayer
  multiplayer: {
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
  };

  // TTS
  tts: SpeechSettings;

  // Narrator
  narrator: {
    isConnected: boolean;
    connectionError: string | null;
  };

  // Derived
  playerColorMap: Record<string, string>;
  completedClues: Set<string>;
  completedCluesByPlayer: Map<string, { playerId: string }>;
  clueCountsByPlayer: Map<string, number>;
  scoreByPlayer: Map<string, number>;
  multiplayerPlayers: (Player & { score: number })[];
  playerResults: PlayerResult[];
  isComplete: boolean;
  showCompletionModal: boolean;
  joinUrl: string | null;

  // Handlers
  handlePuzzleLoaded: (p: Puzzle, fileBuffer?: ArrayBuffer) => Promise<void>;
  handleStartGame: () => Promise<void>;
  handleCloseRoom: () => Promise<void>;
  handleNewPuzzle: () => void;
  handleBackToMenu: () => void;
}

const HostContext = createContext<HostContextValue | null>(null);

export function useHostContext(): HostContextValue {
  const ctx = useContext(HostContext);
  if (!ctx) throw new Error("useHostContext must be used within HostLayout");
  return ctx;
}

export function HostLayout() {
  const navigate = useNavigate();
  const { user } = useSupabase();
  const {
    puzzle,
    playerCells,
    selectedCell,
    highlightedCells,
    score,
    totalWhiteCells,
    dispatch,
    loadPuzzle,
    selectCell,
  } = usePuzzle();

  const tts = useSpeechSettings();

  const hostSession = useMemo(() => loadHostSession(), []);

  const [urlPuzzle, setUrlPuzzle] = useState<Puzzle | null>(() =>
    window.location.hash.startsWith("#puzzle=") ? extractPuzzleFromUrl() : null,
  );

  const [gameId, setGameId] = useState<string | null>(() => hostSession?.gameId ?? null);
  const [completionModalDismissed, setCompletionModalDismissed] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [wrongAnswerTimeout, setWrongAnswerTimeout] = useState(0);

  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const playerCellsRef = useRef(playerCells);
  playerCellsRef.current = playerCells;
  const playersRef = useRef<{ userId: string; displayName: string }[]>([]);
  const narratorSendEventRef = useRef<((event: AgentGameEvent) => void) | null>(null);
  const previousLeaderRef = useRef<string | null>(null);

  const handleCellClaimed = useCallback(
    (row: number, col: number, _letter: string, playerId: string) => {
      if (!puzzle) return;
      const completed = getNewlyCompletedClues(puzzle, playerCellsRef.current, row, col);

      if (tts.narratorEngine !== null && narratorSendEventRef.current && completed.length > 0) {
        // Build per-player clue scores for narrator
        const cluesByPlayer = getCompletedCluesByPlayer(puzzle, playerCellsRef.current);
        const clueScores = countCluesPerPlayer(cluesByPlayer);
        const totalClues = puzzle.clues.length;
        const playerScores = playersRef.current.map((p) => ({
          name: p.displayName,
          score: clueScores.get(p.userId) ?? 0,
        }));

        for (const clue of completed) {
          const player = playersRef.current.find((p) => p.userId === playerId);
          const playerName = player?.displayName ?? "Unknown";
          narratorSendEventRef.current(
            buildClueCompletedEvent(
              playerName,
              clue.number,
              clue.direction,
              clue.text,
              clue.answer,
              playerScores,
              totalClues,
            ),
          );
        }

        // Lead-change detection
        const sorted = [...playerScores].sort((a, b) => b.score - a.score);
        const currentLeader = sorted[0]?.score > 0 && sorted[0].score > (sorted[1]?.score ?? 0)
          ? sorted[0].name
          : null;
        if (
          currentLeader &&
          previousLeaderRef.current &&
          currentLeader !== previousLeaderRef.current
        ) {
          narratorSendEventRef.current(
            buildLeadChangeEvent(
              currentLeader,
              previousLeaderRef.current,
              playerScores,
              totalClues,
            ),
          );
        }
        previousLeaderRef.current = currentLeader;
      } else {
        for (const clue of completed) {
          const player = playersRef.current.find((p) => p.userId === playerId);
          const playerName = player?.displayName ?? "Unknown";
          const text =
            tts.engine === "elevenlabs"
              ? `${playerName} completed ${clue.number} ${clue.direction}: ${clue.answer.toLowerCase()}`
              : `${playerName} -- ${clue.number} ${clue.direction} -- ${clue.text} -- ${clue.answer.toLowerCase()}`;
          tts.speak(text);
        }
      }
    },
    [puzzle, tts.speak, tts.engine, tts.narratorEngine],
  );

  const multiplayer = useMultiplayer(
    gameId && puzzle && user
      ? {
          gameId,
          userId: user.id,
          puzzle,
          dispatch,
          playerCells,
          totalWhiteCells,
          onCellClaimed: handleCellClaimed,
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

  playersRef.current = multiplayer.players;

  // Narrator — compute clue-based scores
  const narratorPlayerScores = useMemo(() => {
    if (!puzzle) return [];
    const cluesByPlayer = getCompletedCluesByPlayer(puzzle, playerCells);
    const clueScores = countCluesPerPlayer(cluesByPlayer);
    return multiplayer.players.map((p) => ({
      name: p.displayName,
      score: clueScores.get(p.userId) ?? 0,
    }));
  }, [puzzle, playerCells, multiplayer.players]);

  const narrator = useNarrator({
    narratorEngine: tts.narratorEngine,
    ttsEngine: tts.engine,
    enabled: tts.elevenLabsAvailable && !tts.muted,
    gameStatus: multiplayer.gameStatus,
    players: multiplayer.players,
    puzzle,
    playerScores: narratorPlayerScores,
  });

  narratorSendEventRef.current = narrator.sendEvent;

  // Listen for hash changes
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash.startsWith("#puzzle=")) {
        const puzzle = extractPuzzleFromUrl();
        if (puzzle) {
          setUrlPuzzle(puzzle);
          navigate("/host/puzzle-ready");
        }
      } else if (hasImportHash()) {
        setImportFailed(false);
        navigate("/host/importing");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [navigate]);

  // Save host session to localStorage
  useEffect(() => {
    if (!gameId) return;
    saveHostSession({ gameId });
  }, [gameId]);

  // Handle initial routing
  useEffect(() => {
    // This runs once on mount for each condition
  }, []);

  // Rejoin host game on refresh
  useEffect(() => {
    // Only handle rejoin if we're on /host/rejoin
    // The actual rejoin screen component handles this
  }, []);

  // Transition from lobby to spectating when game starts
  useEffect(() => {
    if (multiplayer.gameStatus === "active" && gameId) {
      // Check if we're on the lobby page
      if (window.location.pathname.includes("/lobby/")) {
        navigate(`/host/spectate/${gameId}`, { replace: true });
      }
    }
  }, [multiplayer.gameStatus, gameId, navigate]);

  // Boot spectator view when room is closed (mirrors RootLayout pattern)
  useEffect(() => {
    if (multiplayer.isRoomClosed) {
      setGameId(null);
      clearHostSession();
      navigate("/host");
    }
  }, [multiplayer.isRoomClosed, navigate]);

  const handlePuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      loadPuzzle(p);
      fileBufferRef.current = fileBuffer ?? null;

      if (!user) return;
      const puzzleId = await uploadPuzzle(p, fileBuffer);
      if (!puzzleId) return;

      if (multiplayer.shareCode) {
        const result = await createNextGame(puzzleId, user.id, multiplayer.shareCode, {
          spectator: true,
        });
        if (result) {
          multiplayer.broadcastNewGame(result.gameId);
          setGameId(result.gameId);
          setCompletionModalDismissed(false);
          navigate(`/host/lobby/${result.gameId}`);
          return;
        }
      }

      const result = await createGame(puzzleId, user.id, {
        multiplayer: true,
        spectator: true,
      });
      if (result) {
        setGameId(result.gameId);
        setCompletionModalDismissed(false);
        navigate(`/host/lobby/${result.gameId}`);
      }
    },
    [loadPuzzle, user, multiplayer, navigate],
  );

  const handleStartGame = useCallback(async () => {
    await multiplayer.startGame({ wrongAnswerTimeoutSeconds: wrongAnswerTimeout });
    if (gameId) {
      navigate(`/host/spectate/${gameId}`);
    }
  }, [multiplayer, wrongAnswerTimeout, gameId, navigate]);

  const handleCloseRoom = useCallback(async () => {
    if (!window.confirm(tStatic('playing.closeRoomConfirm'))) return;
    await multiplayer.closeRoom();
    setGameId(null);
    clearHostSession();
    navigate("/host");
  }, [multiplayer, navigate]);

  const handleNewPuzzle = useCallback(() => {
    setCompletionModalDismissed(true);
    navigate("/host/import");
  }, [navigate]);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    setGameId(null);
    clearHostSession();
    navigate("/host");
  }, [navigate]);

  // Derived values
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
      multiplayer.players.map((p) => ({
        ...p,
        score: scoreByPlayer.get(p.userId) ?? 0,
      })),
    [multiplayer.players, scoreByPlayer],
  );

  const playerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of multiplayer.players) {
      map[p.userId] = p.color;
    }
    return map;
  }, [multiplayer.players]);

  const completedClues = useMemo(
    () => (puzzle ? getCompletedClues(puzzle, playerCells) : new Set<string>()),
    [puzzle, playerCells],
  );

  const completedCluesByPlayer = useMemo(
    () => (puzzle ? getCompletedCluesByPlayer(puzzle, playerCells) : new Map<string, { playerId: string }>()),
    [puzzle, playerCells],
  );

  const clueCountsByPlayer = useMemo(
    () => countCluesPerPlayer(completedCluesByPlayer),
    [completedCluesByPlayer],
  );

  const playerResults: PlayerResult[] = useMemo(
    () =>
      multiplayerPlayers.map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        color: p.color,
        cellsClaimed: p.score,
        cluesCompleted: clueCountsByPlayer.get(p.userId) ?? 0,
      })),
    [multiplayerPlayers, clueCountsByPlayer],
  );

  const isComplete = totalWhiteCells > 0 && score === totalWhiteCells;

  const showCompletionModal = multiplayer.gameStatus === "completed" && !completionModalDismissed;

  const joinUrl = multiplayer.shareCode
    ? `${window.location.origin}/?join=${multiplayer.shareCode}`
    : null;

  const value: HostContextValue = {
    user,
    puzzle,
    playerCells,
    selectedCell,
    highlightedCells,
    score,
    totalWhiteCells,
    dispatch,
    loadPuzzle,
    selectCell,
    gameId,
    urlPuzzle,
    setUrlPuzzle,
    importFailed,
    setImportFailed,
    wrongAnswerTimeout,
    setWrongAnswerTimeout,
    completionModalDismissed,
    setCompletionModalDismissed,
    multiplayer,
    tts,
    narrator: {
      isConnected: narrator.isConnected,
      connectionError: narrator.connectionError,
    },
    playerColorMap,
    completedClues,
    completedCluesByPlayer,
    clueCountsByPlayer,
    scoreByPlayer,
    multiplayerPlayers,
    playerResults,
    isComplete,
    showCompletionModal,
    joinUrl,
    handlePuzzleLoaded,
    handleStartGame,
    handleCloseRoom,
    handleNewPuzzle,
    handleBackToMenu,
  };

  return (
    <HostContext.Provider value={value}>
      <Outlet />
    </HostContext.Provider>
  );
}
