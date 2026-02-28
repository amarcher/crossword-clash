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
import { uploadPuzzle, createGame, createNextGame, rejoinGame } from "./lib/puzzleService";
import { loadHostSession, saveHostSession, clearHostSession } from "./lib/sessionPersistence";
import { getCompletedCluesByPlayer, countCluesPerPlayer, getNewlyCompletedClues } from "./lib/gridUtils";
import { Title } from "./components/Title";
import { CompletionModal } from "./components/CompletionModal";
import { useSpeechSettings } from "./hooks/useSpeechSettings";
import { TTSMuteButton, TTSSettingsModal } from "./components/TTSControls";
import type { PlayerResult } from "./components/CompletionModal";
import { extractPuzzleFromUrl, hasImportHash, listenForImportedPuzzle, readPuzzleFromClipboard } from "./lib/puzzleUrl";
import type { Puzzle } from "./types/puzzle";

type HostMode = "menu" | "import" | "lobby" | "spectating" | "rejoining" | "puzzle-ready" | "importing";

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

  const tts = useSpeechSettings();

  const hostSession = useMemo(() => loadHostSession(), []);

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
          setMode("puzzle-ready");
        }
      } else if (hasImportHash()) {
        setImportFailed(false);
        setMode("importing");
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const [mode, setMode] = useState<HostMode>(() => {
    if (urlPuzzle) return "puzzle-ready";
    if (hasImportHash()) return "importing";
    if (hostSession) return "rejoining";
    return "menu";
  });
  const [gameId, setGameId] = useState<string | null>(() => hostSession?.gameId ?? null);
  const [completionModalDismissed, setCompletionModalDismissed] = useState(false);
  const [importFailed, setImportFailed] = useState(false);

  // Handle puzzle import via postMessage (triggered by bookmarklet)
  useEffect(() => {
    if (mode !== "importing") return;
    listenForImportedPuzzle().then((puzzle) => {
      if (puzzle) {
        setUrlPuzzle(puzzle);
        setMode("puzzle-ready");
      } else {
        setImportFailed(true);
      }
    });
  }, [mode]);

  const fileBufferRef = useRef<ArrayBuffer | null>(null);

  // Refs for event-driven clue announcements (avoids stale closures)
  const playerCellsRef = useRef(playerCells);
  playerCellsRef.current = playerCells;
  const playersRef = useRef<{ userId: string; displayName: string }[]>([]);

  const handleCellClaimed = useCallback(
    (row: number, col: number, _letter: string, playerId: string) => {
      if (!puzzle) return;
      const completed = getNewlyCompletedClues(puzzle, playerCellsRef.current, row, col);
      for (const clue of completed) {
        const player = playersRef.current.find((p) => p.userId === playerId);
        const playerName = player?.displayName ?? "Unknown";
        const text = `${playerName} — ${clue.number} ${clue.direction} — ${clue.text} — ${clue.answer.toLowerCase()}`;
        tts.speak(text);
      }
    },
    [puzzle, tts.speak],
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

  // Keep players ref in sync for announcements
  playersRef.current = multiplayer.players;

  // Fallback: if puzzle-ready mode but no puzzle, go to menu
  useEffect(() => {
    if (mode === "puzzle-ready" && !urlPuzzle) setMode("menu");
  }, [mode, urlPuzzle]);

  // Auto-advance from menu to import once authenticated
  useEffect(() => {
    if (mode === "menu" && user) setMode("import");
  }, [mode, user]);

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

      // If we have an existing share code, reuse it for the next game
      if (multiplayer.shareCode) {
        const result = await createNextGame(puzzleId, user.id, multiplayer.shareCode, {
          spectator: true,
        });
        if (result) {
          multiplayer.broadcastNewGame(result.gameId);
          setGameId(result.gameId);
          setCompletionModalDismissed(false);
          setMode("lobby");
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
        setMode("lobby");
      }
    },
    [loadPuzzle, user, multiplayer],
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

  const handleNewPuzzle = useCallback(() => {
    setCompletionModalDismissed(true);
    setMode("import");
  }, []);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    setGameId(null);
    setMode("menu");
    clearHostSession();
  }, []);

  // Transition from lobby to spectating when game starts
  useEffect(() => {
    if (mode === "lobby" && multiplayer.gameStatus === "active") {
      setMode("spectating");
    }
  }, [mode, multiplayer.gameStatus]);

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

  const isComplete =
    totalWhiteCells > 0 && score === totalWhiteCells;

  const showCompletionModal =
    multiplayer.gameStatus === "completed" && !completionModalDismissed;

  const joinUrl = multiplayer.shareCode
    ? `${window.location.origin}/?join=${multiplayer.shareCode}`
    : null;

  // Reconnecting screen
  if (mode === "rejoining") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
        <Title variant="dark" className="mb-4" />
        <p className="text-neutral-400">Reconnecting to game...</p>
      </div>
    );
  }

  // Importing screen (waiting for puzzle data via postMessage)
  if (mode === "importing") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
        <Title variant="dark" className="mb-6" />
        {importFailed ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-neutral-400 text-center">
              Could not receive puzzle automatically.
              <br />
              Click below to paste from clipboard.
            </p>
            <button
              onClick={async () => {
                const puzzle = await readPuzzleFromClipboard();
                if (puzzle) {
                  setUrlPuzzle(puzzle);
                  setMode("puzzle-ready");
                } else {
                  alert("No valid puzzle data found in clipboard. Try clicking the bookmarklet again.");
                }
              }}
              className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              Paste from Clipboard
            </button>
            <button
              onClick={() => setMode("menu")}
              className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              Back to menu
            </button>
          </div>
        ) : (
          <p className="text-neutral-400">Receiving puzzle...</p>
        )}
      </div>
    );
  }

  // Puzzle ready screen (from bookmarklet)
  if (mode === "puzzle-ready" && urlPuzzle) {
    const acrossCount = urlPuzzle.clues.filter((c) => c.direction === "across").length;
    const downCount = urlPuzzle.clues.filter((c) => c.direction === "down").length;
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
        <Title variant="dark" className="mb-6" />
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-neutral-300">{urlPuzzle.title}</h2>
          {urlPuzzle.author && (
            <p className="text-sm text-neutral-400 mt-1">by {urlPuzzle.author}</p>
          )}
          <p className="text-sm text-neutral-400 mt-2">
            {urlPuzzle.width}&times;{urlPuzzle.height} &middot; {acrossCount} across, {downCount} down
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {user ? (
            <button
              onClick={() => handlePuzzleLoaded(urlPuzzle)}
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

  // Menu
  if (mode === "menu") {
    return (
      <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
        <Title variant="dark" className="mb-2" />
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
        <Title variant="dark" />
        <p className="text-2xl font-semibold text-white -mt-4">Waiting for Players</p>

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
    <>
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
        <div className="bg-white rounded-xl p-5">
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
      controls={
        <>
          <TTSMuteButton muted={tts.muted} toggleMute={tts.toggleMute} openSettings={tts.openSettings} />
          <TTSSettingsModal
            settingsOpen={tts.settingsOpen}
            closeSettings={tts.closeSettings}
            voices={tts.voices}
            voiceName={tts.voiceName}
            setVoiceName={tts.setVoiceName}
            rate={tts.rate}
            setRate={tts.setRate}
            pitch={tts.pitch}
            setPitch={tts.setPitch}
            speak={tts.speak}
          />
        </>
      }
    />
    <CompletionModal
      open={showCompletionModal}
      totalCells={totalWhiteCells}
      totalClues={puzzle.clues.length}
      players={playerResults}
      onNewPuzzle={handleNewPuzzle}
      onBackToMenu={handleBackToMenu}
      darkMode
    />
    </>
  );
}

export default HostApp;
