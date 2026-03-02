import { useCallback, useMemo, useRef } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { CrosswordGrid, useGridNavigation } from "../components/CrosswordGrid";
import { CluePanel } from "../components/CluePanel";
import { MobileClueBar, MobileClueSheet } from "../components/ClueBar";
import { GameLayout } from "../components/Layout/GameLayout";
import { Scoreboard } from "../components/Scoreboard/Scoreboard";
import { CompletionModal } from "../components/CompletionModal";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { clearMpSession } from "../lib/sessionPersistence";
import type { PuzzleClue } from "../types/puzzle";

export function SoloPlayScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const game = useGame();
  const mp = useMultiplayerContext();

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
    selectCell,
    toggleDirection,
    setDirection,
    deleteLetter,
    moveSelection,
    nextWord,
    prevWord,
    reset,
    clueSheetOpen,
    setClueSheetOpen,
    completionModalDismissed,
    setCompletionModalDismissed,
  } = game;

  const { soloInputLetter, rejectedCell, completedClues } = mp;

  const gridInputRef = useRef<HTMLInputElement>(null);

  const navActions = useMemo(
    () => ({
      inputLetter: soloInputLetter,
      deleteLetter,
      moveSelection,
      nextWord,
      prevWord,
      toggleDirection,
    }),
    [soloInputLetter, deleteLetter, moveSelection, nextWord, prevWord, toggleDirection],
  );

  useGridNavigation(navActions);

  const handleReset = useCallback(() => {
    reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/");
  }, [reset, game, navigate]);

  const handleNewPuzzle = useCallback(() => {
    setCompletionModalDismissed(true);
    navigate("/solo/import");
  }, [setCompletionModalDismissed, navigate]);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    handleReset();
  }, [setCompletionModalDismissed, handleReset]);

  function handleClueClick(clue: PuzzleClue) {
    selectCell(clue.row, clue.col);
    setDirection(clue.direction);
    setClueSheetOpen(false);
    gridInputRef.current?.focus();
  }

  // Guard: redirect to import if no puzzle loaded
  if (!puzzle) {
    return <Navigate to="/solo/import" replace />;
  }

  const showCompletionModal = isComplete && !completionModalDismissed;

  return (
    <>
      <GameLayout
        header={
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-base md:text-xl font-bold truncate">{puzzle.title}</h1>
                {puzzle.author && (
                  <p className="hidden md:block text-sm text-neutral-500">{t('playing.by', { author: puzzle.author })}</p>
                )}
              </div>
              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                <button
                  onClick={handleReset}
                  className="text-sm px-2.5 md:px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
                >
                  <span className="md:hidden">{t('playing.newPuzzle')}</span>
                  <span className="hidden md:inline">{t('playing.loadDifferent')}</span>
                </button>
              </div>
            </div>
            {activeClue && (
              <div className="hidden sm:block text-sm font-medium text-blue-700 mt-1 truncate">
                {activeClue.number}-{direction === "across" ? t('clueBar.directionAbbrevAcross') : t('clueBar.directionAbbrevDown')}: {activeClue.text}
              </div>
            )}
          </>
        }
        grid={
          <div className="relative">
            <CrosswordGrid
              puzzle={puzzle}
              playerCells={playerCells}
              selectedCell={selectedCell}
              highlightedCells={highlightedCells}
              onCellClick={selectCell}
              completedClues={completedClues}
              navigationActions={navActions}
              rejectedCell={rejectedCell}
              inputRef={gridInputRef}
            />
          </div>
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
                <Scoreboard
                  score={score}
                  totalCells={totalWhiteCells}
                  isComplete={isComplete}
                />
              }
              cluePanel={
                <CluePanel
                  clues={puzzle.clues}
                  activeClue={activeClue}
                  onClueClick={handleClueClick}
                  completedClues={completedClues}
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
            />
            <Scoreboard
              score={score}
              totalCells={totalWhiteCells}
              isComplete={isComplete}
            />
          </div>
        }
      />
      <CompletionModal
        open={showCompletionModal}
        totalCells={totalWhiteCells}
        totalClues={puzzle.clues.length}
        soloScore={score}
        onNewPuzzle={handleNewPuzzle}
        onBackToMenu={handleBackToMenu}
      />
    </>
  );
}
