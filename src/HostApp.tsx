import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { usePuzzle } from "./hooks/usePuzzle";
import { useSupabase } from "./hooks/useSupabase";
import { useMultiplayer } from "./hooks/useMultiplayer";
import { CrosswordGrid } from "./components/CrosswordGrid";
import { CluePanel } from "./components/CluePanel";
import { TVLayout } from "./components/Layout/TVLayout";
import { PuzzleImporter } from "./components/PuzzleImporter";
import { MultiplayerScoreboard } from "./components/Scoreboard/MultiplayerScoreboard";
import { uploadPuzzle, createGame, rejoinGame } from "./lib/puzzleService";
import { loadHostSession, saveHostSession, clearHostSession } from "./lib/sessionPersistence";
import { getCompletedCluesByPlayer } from "./lib/gridUtils";
import type { Puzzle } from "./types/puzzle";

type HostMode = "menu" | "import" | "lobby" | "spectating" | "rejoining";

function HostApp() {
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

  const hostSession = useMemo(() => loadHostSession(), []);

  const [mode, setMode] = useState<HostMode>(() => (hostSession ? "rejoining" : "menu"));
  const [gameId, setGameId] = useState<string | null>(() => hostSession?.gameId ?? null);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);

  const multiplayer = useMultiplayer(
    gameId && puzzle && user
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

  // Save host session to localStorage
  useEffect(() => {
    if (!gameId) return;
    saveHostSession({ gameId });
  }, [gameId]);

  // Rejoin host game on page refresh
  useEffect(() => {
    if (mode !== "rejoining" || !user) return;
    const session = loadHostSession();
    if (!session) {
      setMode("menu");
      return;
    }

    rejoinGame(session.gameId, user.id, "", { spectator: true }).then((result) => {
      if (!result) {
        clearHostSession();
        setMode("menu");
        return;
      }

      loadPuzzle(result.puzzle);
      if (result.cells && Object.keys(result.cells).length > 0) {
        const cellScore = Object.values(result.cells).filter((c) => c.correct).length;
        dispatch({ type: "HYDRATE_CELLS", cells: result.cells, score: cellScore });
      }

      setGameId(result.gameId);

      if (result.status === "waiting") {
        setMode("lobby");
      } else {
        setMode("spectating");
      }
    });
  }, [mode, user, loadPuzzle, dispatch]);

  const handlePuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      loadPuzzle(p);
      fileBufferRef.current = fileBuffer ?? null;

      if (!user) return;
      const puzzleId = await uploadPuzzle(p, fileBuffer);
      if (!puzzleId) return;
      const result = await createGame(puzzleId, user.id, {
        multiplayer: true,
        spectator: true,
      });
      if (result) {
        setGameId(result.gameId);
        setMode("lobby");
      }
    },
    [loadPuzzle, user],
  );

  const handleStartGame = useCallback(async () => {
    await multiplayer.startGame();
    setMode("spectating");
  }, [multiplayer]);

  const handleCloseRoom = useCallback(async () => {
    if (!window.confirm("Close this room? All players will be disconnected.")) return;
    await multiplayer.closeRoom();
    setGameId(null);
    setMode("menu");
    clearHostSession();
  }, [multiplayer]);

  // Transition from lobby to spectating when game starts
  useEffect(() => {
    if (mode === "lobby" && multiplayer.gameStatus === "active") {
      setMode("spectating");
    }
  }, [mode, multiplayer.gameStatus]);

  // Clear host session when game completes
  useEffect(() => {
    if (multiplayer.gameStatus === "completed") {
      clearHostSession();
    }
  }, [multiplayer.gameStatus]);

  const multiplayerPlayers = useMemo(
    () =>
      multiplayer.players.map((p) => ({
        ...p,
        score: Object.values(playerCells).filter(
          (c) => c.correct && c.playerId === p.userId,
        ).length,
      })),
    [multiplayer.players, playerCells],
  );

  const playerColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of multiplayer.players) {
      map[p.userId] = p.color;
    }
    return map;
  }, [multiplayer.players]);

  const completedCluesByPlayer = useMemo(
    () => (puzzle ? getCompletedCluesByPlayer(puzzle, playerCells) : new Map<string, { playerId: string }>()),
    [puzzle, playerCells],
  );

  const isComplete =
    totalWhiteCells > 0 && score === totalWhiteCells;

  const joinUrl = multiplayer.shareCode
    ? `${window.location.origin}/?join=${multiplayer.shareCode}`
    : null;

  // Reconnecting screen
  if (mode === "rejoining") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
        <h1 className="text-3xl font-bold mb-2 text-white">Crossword Clash</h1>
        <p className="text-neutral-400">Reconnecting to game...</p>
      </div>
    );
  }

  // Menu
  if (mode === "menu") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
        <h1 className="text-3xl font-bold mb-2 text-white">Crossword Clash</h1>
        <p className="text-neutral-400 mb-8">TV / Host View</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {user ? (
            <button
              onClick={() => setMode("import")}
              className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Host Game
            </button>
          ) : (
            <p className="text-neutral-500 text-center text-sm">
              Connecting to server...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Import
  if (mode === "import") {
    return <PuzzleImporter onPuzzleLoaded={handlePuzzleLoaded} />;
  }

  // Lobby
  if (mode === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8 gap-8">
        <h1 className="text-3xl font-bold text-white">Waiting for Players</h1>

        {joinUrl && (
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-xl">
              <QRCode value={joinUrl} size={200} />
            </div>
            <div className="text-center">
              <p className="text-neutral-400 text-sm mb-1">Room Code</p>
              <p className="font-mono font-bold text-4xl text-white tracking-widest">
                {multiplayer.shareCode}
              </p>
            </div>
          </div>
        )}

        <div className="w-full max-w-xs space-y-2">
          <p className="text-neutral-400 text-sm text-center">
            Players ({multiplayer.players.length})
          </p>
          {multiplayer.players.map((player) => (
            <div
              key={player.userId}
              className="flex items-center gap-3 px-4 py-2 bg-neutral-800 rounded-lg"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: player.color }}
              />
              <span className="text-white font-medium truncate">
                {player.displayName}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleStartGame}
            disabled={multiplayer.players.length < 2}
            className="px-8 py-3 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:cursor-not-allowed transition-colors"
          >
            Start Game
          </button>
          <button
            onClick={handleCloseRoom}
            className="px-6 py-3 rounded-lg font-semibold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
          >
            Close Room
          </button>
        </div>
      </div>
    );
  }

  // Spectating
  if (!puzzle) return null;

  return (
    <TVLayout
      grid={
        <CrosswordGrid
          puzzle={puzzle}
          playerCells={playerCells}
          selectedCell={selectedCell}
          highlightedCells={highlightedCells}
          onCellClick={selectCell}
          playerColorMap={playerColorMap}
          interactive={false}
        />
      }
      sidebar={
        <div className="bg-neutral-800 rounded-xl p-4 space-y-4">
          <div className="text-center">
            <p className="text-neutral-400 text-xs uppercase tracking-wide mb-1">Room Code</p>
            <p className="font-mono font-bold text-2xl text-white tracking-widest">
              {multiplayer.shareCode}
            </p>
          </div>
          {joinUrl && (
            <div className="flex justify-center">
              <div className="bg-white p-2 rounded-lg">
                <QRCode value={joinUrl} size={100} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-neutral-400 text-xs uppercase tracking-wide">
              Players ({multiplayer.players.length})
            </p>
            {multiplayer.players.map((player) => (
              <div
                key={player.userId}
                className="flex items-center gap-2"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: player.color }}
                />
                <span className="text-sm text-neutral-200 truncate">
                  {player.displayName}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={handleCloseRoom}
            className="w-full text-sm px-3 py-2 rounded-lg text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
          >
            Close Room
          </button>
        </div>
      }
      scoreboard={
        <div className="bg-white rounded-xl p-4">
          <MultiplayerScoreboard
            players={multiplayerPlayers}
            totalCells={totalWhiteCells}
            isComplete={isComplete}
          />
        </div>
      }
      clues={
        <div className="bg-white rounded-xl p-4 h-full flex flex-col">
          <CluePanel
            clues={puzzle.clues}
            activeClue={null}
            onClueClick={() => {}}
            completedCluesByPlayer={completedCluesByPlayer}
            playerColorMap={playerColorMap}
          />
        </div>
      }
    />
  );
}

export default HostApp;
