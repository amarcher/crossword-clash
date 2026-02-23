import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePuzzle } from "./hooks/usePuzzle";
import { useSupabase } from "./hooks/useSupabase";
import { CrosswordGrid, useGridNavigation } from "./components/CrosswordGrid";
import { CluePanel } from "./components/CluePanel";
import { GameLayout } from "./components/Layout/GameLayout";
import { PuzzleImporter } from "./components/PuzzleImporter";
import { Scoreboard } from "./components/Scoreboard/Scoreboard";
import { uploadPuzzle, createGame, updateGame } from "./lib/puzzleService";
import type { Puzzle, PuzzleClue } from "./types/puzzle";

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

  const [gameId, setGameId] = useState<string | null>(null);
  const fileBufferRef = useRef<ArrayBuffer | null>(null);

  const navActions = useMemo(
    () => ({
      inputLetter,
      deleteLetter,
      moveSelection,
      nextWord,
      prevWord,
      toggleDirection,
    }),
    [inputLetter, deleteLetter, moveSelection, nextWord, prevWord, toggleDirection],
  );

  useGridNavigation(navActions);

  // Persist game state to Supabase when cells change
  useEffect(() => {
    if (!gameId || !user) return;
    const status = isComplete ? "completed" : "active";
    updateGame(gameId, playerCells, status, score, user.id);
  }, [gameId, user, playerCells, score, isComplete]);

  const handlePuzzleLoaded = useCallback(
    async (p: Puzzle, fileBuffer?: ArrayBuffer) => {
      loadPuzzle(p);
      fileBufferRef.current = fileBuffer ?? null;

      if (!user) return;

      // Upload puzzle to DB
      const puzzleId = await uploadPuzzle(p, fileBuffer);
      if (!puzzleId) return;

      // Create game session
      const newGameId = await createGame(puzzleId, user.id);
      setGameId(newGameId);
    },
    [loadPuzzle, user],
  );

  const handleReset = useCallback(() => {
    reset();
    setGameId(null);
    fileBufferRef.current = null;
  }, [reset]);

  if (!puzzle) {
    return <PuzzleImporter onPuzzleLoaded={handlePuzzleLoaded} />;
  }

  function handleClueClick(clue: PuzzleClue) {
    selectCell(clue.row, clue.col);
    setDirection(clue.direction);
  }

  return (
    <GameLayout
      header={
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{puzzle.title}</h1>
            {puzzle.author && (
              <p className="text-sm text-neutral-500">by {puzzle.author}</p>
            )}
          </div>
          <div className="flex items-center gap-4">
            {activeClue && (
              <div className="text-sm font-medium text-blue-700 hidden sm:block">
                {activeClue.number}-{direction === "across" ? "A" : "D"}: {activeClue.text}
              </div>
            )}
            <button
              onClick={handleReset}
              className="text-sm px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
            >
              Load Different Puzzle
            </button>
          </div>
        </div>
      }
      grid={
        <CrosswordGrid
          puzzle={puzzle}
          playerCells={playerCells}
          selectedCell={selectedCell}
          highlightedCells={highlightedCells}
          onCellClick={selectCell}
        />
      }
      clues={
        <div className="flex flex-col gap-2 h-full">
          <Scoreboard
            score={score}
            totalCells={totalWhiteCells}
            isComplete={isComplete}
          />
          {activeClue && (
            <div className="sm:hidden p-1.5 bg-blue-50 rounded text-xs font-medium text-blue-700">
              {activeClue.number}-{direction === "across" ? "A" : "D"}: {activeClue.text}
            </div>
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
