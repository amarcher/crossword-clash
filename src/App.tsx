import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { usePuzzle } from "./hooks/usePuzzle";
import { useSupabase } from "./hooks/useSupabase";
import { useMultiplayer } from "./hooks/useMultiplayer";
import { CrosswordGrid, useGridNavigation } from "./components/CrosswordGrid";
import { CluePanel } from "./components/CluePanel";
import { MobileClueBar, MobileClueSheet } from "./components/ClueBar";
import { GameLayout } from "./components/Layout/GameLayout";
import { PuzzleImporter } from "./components/PuzzleImporter";
import { Scoreboard } from "./components/Scoreboard/Scoreboard";
import { MultiplayerScoreboard } from "./components/Scoreboard/MultiplayerScoreboard";
import { GameLobby, JoinGame } from "./components/GameLobby";
import { Title } from "./components/Title";
import { PuzzleReady } from "./components/PuzzleReady";
import {
  uploadPuzzle,
  createGame,
  createNextGame,
  updateGame,
  joinGame,
  rejoinGame,
} from "./lib/puzzleService";
import { extractPuzzleFromUrl, compressPuzzleToHash } from "./lib/puzzleUrl";
import { loadMpSession, saveMpSession, clearMpSession } from "./lib/sessionPersistence";
import { getCompletedClues, getCompletedCluesByPlayer, countCluesPerPlayer } from "./lib/gridUtils";
import { CompletionModal } from "./components/CompletionModal";
import type { PlayerResult } from "./components/CompletionModal";
import type { Puzzle, PuzzleClue } from "./types/puzzle";

type GameMode = "menu" | "solo" | "host-name" | "host-import" | "host-lobby" | "join" | "playing" | "rejoining" | "puzzle-ready";

const STORAGE_KEY = "crossword-clash-solo";

function loadSavedSession(): { puzzle: Puzzle; playerCells: Record<string, import("./types/puzzle").CellState>; gameId: string | null } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function App() {
  const { user } = useSupabase();
  const {
    puzzle,
    playerCells,
    selectedCell,
    direction,
    highlightedCells,
    activeClue,
    score,
    totalWhiteCells,
    isComplete,
    dispatch,
    loadPuzzle,
    selectCell,
    toggleDirection,
    setDirection,
    inputLetter,
    deleteLetter,
    moveSelection,
    nextWord,
    prevWord,
    reset,
  } = usePuzzle();

  // Compute initial state from URL params / localStorage (synchronous, no effects)
  const mpSession = useMemo(() => loadMpSession(), []);

  const [urlPuzzle, setUrlPuzzle] = useState<Puzzle | null>(() =>
    window.location.hash.startsWith("#puzzle=") ? extractPuzzleFromUrl() : null,
  );

  // Listen for hash changes so a second bookmarklet click overrides the current puzzle
  useEffect(() => {
    const onHashChange = () => {
      if (window.location.hash.startsWith("#puzzle=")) {
        const puzzle = extractPuzzleFromUrl();
        if (puzzle) {
          setUrlPuzzle(puzzle);
          setGameMode("puzzle-ready");
        }
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [gameMode, setGameMode] = useState<GameMode>(() => {
    if (urlPuzzle) return "puzzle-ready";
    const params = new URLSearchParams(window.location.search);
    if (params.get("join")) return "join";
    if (mpSession) return "rejoining";
    const saved = loadSavedSession();
    if (saved?.puzzle) return "playing";
    return "menu";
  });
  const [gameId, setGameId] = useState<string | null>(() => {
    if (mpSession) return mpSession.gameId;
    const saved = loadSavedSession();
    return saved?.gameId ?? null;
  });
  const [isMultiplayer, setIsMultiplayer] = useState(() => !!mpSession);
  const [joinCode, setJoinCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code && code.length === 6) {
      window.history.replaceState({}, "", window.location.pathname);
      return code.toUpperCase();
    }
    return null;
  });
  const [displayName, setDisplayName] = useState(() => mpSession?.displayName ?? "Player");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [clueSheetOpen, setClueSheetOpen] = useState(false);
  const [completionModalDismissed, setCompletionModalDismissed] = useState(false);
  const [rejectedCell, setRejectedCell] = useState<string | null>(null);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const restoredRef = useRef(false);
  const gridInputRef = useRef<HTMLInputElement>(null);

  const triggerReject = useCallback((row: number, col: number) => {
    if (rejectTimerRef.current) clearTimeout(rejectTimerRef.current);
    // Clear first so re-setting the same key re-triggers the animation
    setRejectedCell(null);
    requestAnimationFrame(() => {
      setRejectedCell(`${row},${col}`);
      navigator.vibrate?.(50);
      rejectTimerRef.current = setTimeout(() => setRejectedCell(null), 400);
    });
  }, []);

  // Restore solo session from localStorage on mount (one-time)
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    // Only restore if we determined gameMode should be "playing" from saved state
    const params = new URLSearchParams(window.location.search);
    if (params.get("join")) return;

    const saved = loadSavedSession();
    if (saved?.puzzle) {
      loadPuzzle(saved.puzzle);
      if (saved.playerCells && Object.keys(saved.playerCells).length > 0) {
        const cellScore = Object.values(saved.playerCells).filter((c) => c.correct).length;
        dispatch({ type: "HYDRATE_CELLS", cells: saved.playerCells, score: cellScore });
      }
    }
  }, [loadPuzzle, dispatch]);

  // Save solo session to localStorage when state changes
  useEffect(() => {
    if (isMultiplayer || !puzzle || gameMode !== "playing") return;
    const data = { puzzle, playerCells, gameId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [puzzle, playerCells, gameId, gameMode, isMultiplayer]);

  // Multiplayer hook — only active when we have a multiplayer game
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
      : // Pass a dummy config that will short-circuit — the hook won't subscribe
        {
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

  // Rejoin multiplayer game on page refresh
  useEffect(() => {
    if (gameMode !== "rejoining" || !user) return;
    const session = loadMpSession();
    if (!session) {
      setGameMode("menu");
      return;
    }

    rejoinGame(session.gameId, user.id, session.displayName).then((result) => {
      if (!result) {
        clearMpSession();
        setGameMode("menu");
        return;
      }

      loadPuzzle(result.puzzle);
      if (result.cells && Object.keys(result.cells).length > 0) {
        const cellScore = Object.values(result.cells).filter((c) => c.correct).length;
        dispatch({ type: "HYDRATE_CELLS", cells: result.cells, score: cellScore });
      }

      setGameId(result.gameId);
      setIsMultiplayer(true);

      if (result.status === "waiting") {
        setGameMode("host-lobby");
      } else {
        setGameMode("playing");
      }
    });
  }, [gameMode, user, loadPuzzle, dispatch]);

  // Build playerColorMap from multiplayer players
  const playerColorMap = useMemo(() => {
    if (!multiplayerActive) return undefined;
    const map: Record<string, string> = {};
    for (const p of multiplayer.players) {
      map[p.userId] = p.color;
    }
    return map;
  }, [multiplayerActive, multiplayer.players]);

  // Solo input wrapper: reject wrong letters with visual feedback
  const soloInputLetter = useCallback(
    (letter: string) => {
      if (!puzzle || !selectedCell) return;
      const { row, col } = selectedCell;
      const cell = puzzle.cells[row]?.[col];
      if (!cell || cell.solution === null) return;

      // Already filled — let reducer handle cursor advancement
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

  // Multiplayer input wrapper: intercepts letter input for server claiming
  const multiplayerInputLetter = useCallback(
    (letter: string) => {
      if (!multiplayerActive || !selectedCell || !puzzle) return;
      const { row, col } = selectedCell;
      const cell = puzzle.cells[row]?.[col];
      if (!cell || cell.solution === null) return;

      if (playerCells[`${row},${col}`]?.correct) {
        multiplayer.claimCell(row, col, letter);
        return;
      }

      if (letter.toUpperCase() !== cell.solution) {
        triggerReject(row, col);
        return;
      }
      multiplayer.claimCell(row, col, letter);
    },
    [multiplayerActive, selectedCell, puzzle, playerCells, multiplayer, triggerReject],
  );

  const navActions = useMemo(
    () => ({
      inputLetter: multiplayerActive ? multiplayerInputLetter : soloInputLetter,
      deleteLetter: multiplayerActive ? () => {} : deleteLetter, // No deletion in multiplayer
      moveSelection,
      nextWord,
      prevWord,
      toggleDirection,
    }),
    [
      multiplayerActive,
      multiplayerInputLetter,
      soloInputLetter,
      deleteLetter,
      moveSelection,
      nextWord,
      prevWord,
      toggleDirection,
    ],
  );

  useGridNavigation(navActions);

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
      setGameMode("playing");

      if (!user) return;
      const puzzleId = await uploadPuzzle(p, fileBuffer);
      if (!puzzleId) return;
      const result = await createGame(puzzleId, user.id);
      if (result) setGameId(result.gameId);
    },
    [loadPuzzle, user],
  );

  // Host puzzle loaded
  const handleHostPuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      loadPuzzle(p);
      fileBufferRef.current = fileBuffer ?? null;

      if (!user) return;
      const puzzleId = await uploadPuzzle(p, fileBuffer);
      if (!puzzleId) return;

      // If we have an existing share code, reuse it for the next game
      if (multiplayer.shareCode) {
        const result = await createNextGame(puzzleId, user.id, multiplayer.shareCode, {
          displayName: displayName.trim() || "Player",
        });
        if (result) {
          multiplayer.broadcastNewGame(result.gameId);
          setGameId(result.gameId);
          setCompletionModalDismissed(false);
          setGameMode("host-lobby");
          return;
        }
      }

      const result = await createGame(puzzleId, user.id, {
        multiplayer: true,
        displayName: displayName.trim() || "Player",
      });
      if (result) {
        setGameId(result.gameId);
        setIsMultiplayer(true);
        setGameMode("host-lobby");
      }
    },
    [loadPuzzle, user, displayName, multiplayer],
  );

  // Join game
  const handleJoin = useCallback(
    async (code: string, displayName: string) => {
      if (!user) return;
      setJoinLoading(true);
      setJoinError(null);

      const result = await joinGame(code, user.id, displayName);
      if (!result) {
        setJoinError("Game not found or not joinable");
        setJoinLoading(false);
        return;
      }

      loadPuzzle(result.puzzle);
      setGameId(result.gameId);
      setIsMultiplayer(true);
      setJoinLoading(false);

      if (result.status === "waiting") {
        setGameMode("host-lobby");
      } else {
        setGameMode("playing");
      }
    },
    [user, loadPuzzle],
  );

  // Start multiplayer game (host)
  const handleStartGame = useCallback(async () => {
    await multiplayer.startGame();
    setGameMode("playing");
  }, [multiplayer]);

  // Close room (host only) — broadcasts room_closed then resets
  const handleCloseRoom = useCallback(async () => {
    if (!window.confirm("Close this room? All players will be disconnected.")) return;
    await multiplayer.closeRoom();
    reset();
    setGameId(null);
    setIsMultiplayer(false);
    setGameMode("menu");
    setJoinCode(null);
    setJoinError(null);
    fileBufferRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
  }, [multiplayer, reset]);

  const handleReset = useCallback(() => {
    reset();
    setGameId(null);
    setIsMultiplayer(false);
    setGameMode("menu");
    setJoinCode(null);
    setJoinError(null);
    fileBufferRef.current = null;
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
  }, [reset]);

  // Transition from lobby to playing when game starts (for non-host)
  useEffect(() => {
    if (gameMode === "host-lobby" && multiplayer.gameStatus === "active") {
      setGameMode("playing");
    }
  }, [gameMode, multiplayer.gameStatus]);

  // Fallback: if puzzle-ready mode but no puzzle, go to menu
  useEffect(() => {
    if (gameMode === "puzzle-ready" && !urlPuzzle) setGameMode("menu");
  }, [gameMode, urlPuzzle]);

  // Boot non-host players when the host closes the room
  useEffect(() => {
    if (multiplayer.isRoomClosed) {
      handleReset();
    }
  }, [multiplayer.isRoomClosed, handleReset]);

  // Clear MP session when game completes (no need to rejoin a finished game)
  useEffect(() => {
    if (multiplayerActive && multiplayer.gameStatus === "completed") {
      clearMpSession();
    }
  }, [multiplayerActive, multiplayer.gameStatus]);

  // Handle new_game broadcast for non-host players: auto-transition
  useEffect(() => {
    if (!multiplayer.newGameId || multiplayer.isHost) return;
    // Save the new game ID and transition to rejoining
    setGameId(multiplayer.newGameId);
    saveMpSession({ gameId: multiplayer.newGameId, shareCode: multiplayer.shareCode, displayName });
    setGameMode("rejoining");
  }, [multiplayer.newGameId, multiplayer.isHost, multiplayer.shareCode, displayName]);

  const handleNewPuzzle = useCallback(() => {
    setCompletionModalDismissed(true);
    if (multiplayerActive) {
      setGameMode("host-import");
    } else {
      setGameMode("solo");
    }
  }, [multiplayerActive]);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    handleReset();
  }, [handleReset]);

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

  const playerResults: PlayerResult[] | undefined = useMemo(() => {
    if (!multiplayerActive) return undefined;
    return multiplayer.players.map((p) => {
      const cellsClaimed = Object.values(playerCells).filter(
        (c) => c.correct && c.playerId === p.userId,
      ).length;
      return {
        userId: p.userId,
        displayName: p.displayName,
        color: p.color,
        cellsClaimed,
        cluesCompleted: clueCountsByPlayer.get(p.userId) ?? 0,
      };
    });
  }, [multiplayerActive, multiplayer.players, playerCells, clueCountsByPlayer]);

  // --- Render based on gameMode ---

  // Reconnecting screen
  if (gameMode === "rejoining") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
        <Title className="mb-4" />
        <p className="text-neutral-500">Reconnecting to game...</p>
      </div>
    );
  }

  // Puzzle ready screen (from bookmarklet URL hash)
  if (gameMode === "puzzle-ready" && urlPuzzle) {
    return (
      <PuzzleReady
        puzzle={urlPuzzle}
        showHostOptions={!!user}
        onPlaySolo={() => handleSoloPuzzleLoaded(urlPuzzle)}
        onHostGame={() => {
          loadPuzzle(urlPuzzle);
          setGameMode("host-name");
        }}
        onHostOnTV={() => {
          const hash = compressPuzzleToHash(urlPuzzle);
          window.location.href = "/host" + hash;
        }}
      />
    );
  }

  // Menu screen
  if (gameMode === "menu") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
        <Title className="mb-8" />
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {user && (
            <>
              <button
                onClick={() => setGameMode("join")}
                className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                Join Game
              </button>
              <button
                onClick={() => setGameMode("host-name")}
                className="px-6 py-3 rounded-lg font-semibold text-blue-600 border-2 border-blue-600 hover:bg-blue-50 transition-colors"
              >
                Host Game as Player
              </button>
              <a
                href="/host"
                className="px-6 py-3 rounded-lg font-semibold text-blue-600 border-2 border-blue-600 hover:bg-blue-50 transition-colors text-center"
              >
                Host Game as TV
              </a>
            </>
          )}
          <button
            onClick={() => setGameMode("solo")}
            className="px-6 py-3 rounded-lg font-semibold text-neutral-600 border-2 border-neutral-300 hover:bg-neutral-100 transition-colors"
          >
            Play Solo
          </button>
        </div>
      </div>
    );
  }

  // Solo import
  if (gameMode === "solo") {
    return <PuzzleImporter onPuzzleLoaded={handleSoloPuzzleLoaded} />;
  }

  // Host name entry
  if (gameMode === "host-name") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
        <Title className="mb-2" />
        <p className="text-neutral-500 mb-6">Enter your display name</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!displayName.trim()) return;
            if (urlPuzzle) {
              handleHostPuzzleLoaded(urlPuzzle);
            } else {
              setGameMode("host-import");
            }
          }}
          className="flex flex-col gap-3 w-full max-w-xs"
          autoComplete="off"
        >
          <input
            type="text"
            name="xw-handle"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            className="px-4 py-2.5 rounded-lg border border-neutral-300 text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoComplete="nofill"
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore
            autoFocus
          />
          <button
            type="submit"
            disabled={!displayName.trim()}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
          >
            Choose Puzzle
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            Back
          </button>
        </form>
      </div>
    );
  }

  // Host import
  if (gameMode === "host-import") {
    return <PuzzleImporter onPuzzleLoaded={handleHostPuzzleLoaded} />;
  }

  // Join game
  if (gameMode === "join") {
    return (
      <JoinGame
        onJoin={handleJoin}
        onBack={handleReset}
        loading={joinLoading}
        error={joinError}
        initialCode={joinCode ?? undefined}
      />
    );
  }

  // Host lobby (waiting for players)
  if (gameMode === "host-lobby") {
    return (
      <GameLobby
        shareCode={multiplayer.shareCode}
        players={multiplayer.players}
        isHost={multiplayer.isHost}
        onStartGame={handleStartGame}
        onCloseRoom={handleCloseRoom}
      />
    );
  }

  // Playing (solo or multiplayer)
  if (!puzzle) {
    return <PuzzleImporter onPuzzleLoaded={handleSoloPuzzleLoaded} />;
  }

  function handleClueClick(clue: PuzzleClue) {
    selectCell(clue.row, clue.col);
    setDirection(clue.direction);
    setClueSheetOpen(false);
    gridInputRef.current?.focus();
  }

  const multiplayerIsComplete =
    multiplayerActive && multiplayer.gameStatus === "completed";
  const gameComplete = multiplayerActive ? multiplayerIsComplete : isComplete;

  const showCompletionModal =
    (multiplayerActive ? multiplayerIsComplete : isComplete) && !completionModalDismissed;

  // Only host or solo players get the "new puzzle" button
  const canChooseNewPuzzle = !multiplayerActive || multiplayer.isHost;

  // Get current player's score from multiplayer players list
  const multiplayerPlayers = multiplayerActive
    ? multiplayer.players.map((p) => ({
        ...p,
        score: Object.values(playerCells).filter(
          (c) => c.correct && c.playerId === p.userId,
        ).length,
      }))
    : [];

  return (
    <>
    <GameLayout
      header={
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-bold truncate">{puzzle.title}</h1>
              {puzzle.author && (
                <p className="hidden md:block text-sm text-neutral-500">by {puzzle.author}</p>
              )}
            </div>
            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              {multiplayerActive && multiplayer.shareCode && (
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-neutral-400 hidden sm:inline">Room</span>
                    <span className="font-mono font-bold text-sm text-neutral-700 tracking-wider">
                      {multiplayer.shareCode}
                    </span>
                  </div>
                  <div className="hidden md:block">
                    <QRCode
                      value={`${window.location.origin}${window.location.pathname}?join=${multiplayer.shareCode}`}
                      size={48}
                    />
                  </div>
                </div>
              )}
              {multiplayerActive && multiplayer.isHost ? (
                <button
                  onClick={handleCloseRoom}
                  className="text-sm px-2.5 md:px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                >
                  <span className="md:hidden">Close</span>
                  <span className="hidden md:inline">Close Room</span>
                </button>
              ) : (
                <button
                  onClick={handleReset}
                  className="text-sm px-2.5 md:px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
                >
                  <span className="md:hidden">{multiplayerActive ? "Leave" : "New Puzzle"}</span>
                  <span className="hidden md:inline">{multiplayerActive ? "Leave Game" : "Load Different Puzzle"}</span>
                </button>
              )}
            </div>
          </div>
          {activeClue && (
            <div className="hidden sm:block text-sm font-medium text-blue-700 mt-1 truncate">
              {activeClue.number}-{direction === "across" ? "A" : "D"}: {activeClue.text}
            </div>
          )}
        </>
      }
      grid={
        <CrosswordGrid
          puzzle={puzzle}
          playerCells={playerCells}
          selectedCell={selectedCell}
          highlightedCells={highlightedCells}
          onCellClick={selectCell}
          playerColorMap={playerColorMap}
          navigationActions={navActions}
          rejectedCell={rejectedCell}
          inputRef={gridInputRef}
        />
      }
      mobileClueBar={
        <>
          <MobileClueBar
            activeClue={activeClue}
            direction={direction}
            onPrevWord={prevWord}
            onNextWord={nextWord}
            onOpenSheet={() => setClueSheetOpen(true)}
            onToggleDirection={toggleDirection}
            inputRef={gridInputRef}
          />
          <MobileClueSheet
            open={clueSheetOpen}
            onClose={() => setClueSheetOpen(false)}
            scoreboard={
              multiplayerActive ? (
                <MultiplayerScoreboard
                  players={multiplayerPlayers}
                  totalCells={totalWhiteCells}
                  isComplete={gameComplete}
                />
              ) : (
                <Scoreboard
                  score={score}
                  totalCells={totalWhiteCells}
                  isComplete={isComplete}
                />
              )
            }
            cluePanel={
              <CluePanel
                clues={puzzle.clues}
                activeClue={activeClue}
                onClueClick={handleClueClick}
                completedClues={completedClues}
                completedCluesByPlayer={completedCluesByPlayer}
                playerColorMap={playerColorMap}
              />
            }
          />
        </>
      }
      clues={
        <div className="flex flex-col gap-2 h-full">
          <CluePanel
            clues={puzzle.clues}
            activeClue={activeClue}
            onClueClick={handleClueClick}
            completedClues={completedClues}
            completedCluesByPlayer={completedCluesByPlayer}
            playerColorMap={playerColorMap}
          />
          {multiplayerActive ? (
            <MultiplayerScoreboard
              players={multiplayerPlayers}
              totalCells={totalWhiteCells}
              isComplete={gameComplete}
            />
          ) : (
            <Scoreboard
              score={score}
              totalCells={totalWhiteCells}
              isComplete={isComplete}
            />
          )}
        </div>
      }
    />
    <CompletionModal
      open={showCompletionModal}
      totalCells={totalWhiteCells}
      totalClues={puzzle.clues.length}
      soloScore={!multiplayerActive ? score : undefined}
      players={playerResults}
      onNewPuzzle={canChooseNewPuzzle ? handleNewPuzzle : undefined}
      onBackToMenu={handleBackToMenu}
    />
    </>
  );
}

export default App;
