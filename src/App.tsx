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
import {
  uploadPuzzle,
  createGame,
  updateGame,
  joinGame,
} from "./lib/puzzleService";
import type { Puzzle, PuzzleClue } from "./types/puzzle";

type GameMode = "menu" | "solo" | "host-name" | "host-import" | "host-lobby" | "join" | "playing";

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
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("join")) return "join";
    const saved = loadSavedSession();
    if (saved?.puzzle) return "playing";
    return "menu";
  });
  const [gameId, setGameId] = useState<string | null>(() => {
    const saved = loadSavedSession();
    return saved?.gameId ?? null;
  });
  const [isMultiplayer, setIsMultiplayer] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("join");
    if (code && code.length === 6) {
      window.history.replaceState({}, "", window.location.pathname);
      return code.toUpperCase();
    }
    return null;
  });
  const [displayName, setDisplayName] = useState("Player");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinLoading, setJoinLoading] = useState(false);
  const [clueSheetOpen, setClueSheetOpen] = useState(false);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);
  const restoredRef = useRef(false);

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

  // Build playerColorMap from multiplayer players
  const playerColorMap = useMemo(() => {
    if (!multiplayerActive) return undefined;
    const map: Record<string, string> = {};
    for (const p of multiplayer.players) {
      map[p.userId] = p.color;
    }
    return map;
  }, [multiplayerActive, multiplayer.players]);

  // Multiplayer input wrapper: intercepts letter input for server claiming
  const multiplayerInputLetter = useCallback(
    (letter: string) => {
      if (!multiplayerActive || !selectedCell || !puzzle) return;
      multiplayer.claimCell(selectedCell.row, selectedCell.col, letter);
    },
    [multiplayerActive, selectedCell, puzzle, multiplayer],
  );

  const navActions = useMemo(
    () => ({
      inputLetter: multiplayerActive ? multiplayerInputLetter : inputLetter,
      deleteLetter: multiplayerActive ? () => {} : deleteLetter, // No deletion in multiplayer
      moveSelection,
      nextWord,
      prevWord,
      toggleDirection,
    }),
    [
      multiplayerActive,
      multiplayerInputLetter,
      inputLetter,
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
    [loadPuzzle, user, displayName],
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
  }, [reset]);

  // Transition from lobby to playing when game starts (for non-host)
  useEffect(() => {
    if (gameMode === "host-lobby" && multiplayer.gameStatus === "active") {
      setGameMode("playing");
    }
  }, [gameMode, multiplayer.gameStatus]);

  // Boot non-host players when the host closes the room
  useEffect(() => {
    if (multiplayer.isRoomClosed) {
      handleReset();
    }
  }, [multiplayer.isRoomClosed, handleReset]);

  // --- Render based on gameMode ---

  // Menu screen
  if (gameMode === "menu") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
        <h1 className="text-3xl font-bold mb-2">Crossword Clash</h1>
        <p className="text-neutral-500 mb-8">Choose how you want to play</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => setGameMode("solo")}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Play Solo
          </button>
          {user && (
            <>
              <button
                onClick={() => setGameMode("host-name")}
                className="px-6 py-3 rounded-lg font-semibold text-blue-600 border-2 border-blue-600 hover:bg-blue-50 transition-colors"
              >
                Host Game
              </button>
              <button
                onClick={() => setGameMode("join")}
                className="px-6 py-3 rounded-lg font-semibold text-neutral-600 border-2 border-neutral-300 hover:bg-neutral-100 transition-colors"
              >
                Join Game
              </button>
            </>
          )}
        </div>
        <a
          href="/host"
          className="mt-6 text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          TV / Host View
        </a>
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
        <h1 className="text-3xl font-bold mb-2">Host a Game</h1>
        <p className="text-neutral-500 mb-6">Enter your display name</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (displayName.trim()) setGameMode("host-import");
          }}
          className="flex flex-col gap-3 w-full max-w-xs"
        >
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            className="px-4 py-2.5 rounded-lg border border-neutral-300 text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
  }

  const multiplayerIsComplete =
    multiplayerActive && multiplayer.gameStatus === "completed";
  const gameComplete = multiplayerActive ? multiplayerIsComplete : isComplete;

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
    <GameLayout
      header={
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
            {activeClue && (
              <div className="text-sm font-medium text-blue-700 hidden sm:block">
                {activeClue.number}-{direction === "across" ? "A" : "D"}: {activeClue.text}
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
      }
      sidebar={
        multiplayerActive ? (
          <div className="space-y-3">
            {multiplayer.shareCode && (
              <div className="text-center">
                <span className="text-xs text-neutral-400">Code: </span>
                <span className="font-mono font-bold text-neutral-700">
                  {multiplayer.shareCode}
                </span>
              </div>
            )}
            <div className="space-y-1">
              {multiplayer.players.map((player) => (
                <div
                  key={player.userId}
                  className="flex items-center gap-2 text-xs"
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="truncate text-neutral-700">
                    {player.displayName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : undefined
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
              />
            }
          />
        </>
      }
      clues={
        <div className="flex flex-col gap-2 h-full">
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
          <CluePanel
            clues={puzzle.clues}
            activeClue={activeClue}
            onClueClick={handleClueClick}
          />
        </div>
      }
    />
  );
}

export default App;
