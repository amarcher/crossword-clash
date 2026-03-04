import { useCallback, useMemo, useRef } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useBeforeUnload } from "../hooks/useBeforeUnload";
import QRCode from "react-qr-code";
import { CrosswordGrid, useGridNavigation } from "../components/CrosswordGrid";
import { CluePanel } from "../components/CluePanel";
import { MobileClueBar, MobileClueSheet } from "../components/ClueBar";
import { GameLayout } from "../components/Layout/GameLayout";
import { MultiplayerScoreboard } from "../components/Scoreboard/MultiplayerScoreboard";
import { LockoutOverlay } from "../components/LockoutOverlay";
import { CompletionModal } from "../components/CompletionModal";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { clearMpSession } from "../lib/sessionPersistence";
import { tStatic } from "../i18n/i18n";
import type { PuzzleClue } from "../types/puzzle";

export function MultiplayerPlayScreen() {
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
    totalWhiteCells,
    selectCell,
    toggleDirection,
    setDirection,
    moveSelection,
    nextWord,
    prevWord,
    reset,
    lockedUntil,
    clueSheetOpen,
    setClueSheetOpen,
    completionModalDismissed,
    setCompletionModalDismissed,
  } = game;

  const {
    multiplayerActive,
    multiplayerInputLetter,
    playerColorMap,
    completedClues,
    completedCluesByPlayer,
    multiplayerPlayers,
    playerResults,
    rejectedCell,
    isHost,
    shareCode,
    gameStatus,
  } = mp;

  useBeforeUnload(gameStatus === "active");

  const gridInputRef = useRef<HTMLInputElement>(null);

  const navActions = useMemo(
    () => ({
      inputLetter: multiplayerInputLetter,
      deleteLetter: () => {}, // No deletion in multiplayer
      moveSelection,
      nextWord,
      prevWord,
      toggleDirection,
    }),
    [multiplayerInputLetter, moveSelection, nextWord, prevWord, toggleDirection],
  );

  useGridNavigation(navActions);

  const handleReset = useCallback(() => {
    mp.leaveGame();
    reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/");
  }, [mp, reset, game, navigate]);

  const handleCloseRoom = useCallback(async () => {
    if (!window.confirm(tStatic('playing.closeRoomConfirm'))) return;
    await mp.closeRoom();
    handleReset();
  }, [mp, handleReset]);

  const handleNewPuzzle = useCallback(() => {
    setCompletionModalDismissed(true);
    navigate("/host-game/import");
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

  if (!puzzle) {
    return <Navigate to="/" replace />;
  }

  if (gameStatus === "waiting" && mp.hydrated && game.gameId) {
    return <Navigate to={`/lobby/${game.gameId}`} replace />;
  }

  const multiplayerIsComplete = multiplayerActive && gameStatus === "completed";
  const gameComplete = multiplayerIsComplete;
  const showCompletionModal = multiplayerIsComplete && !completionModalDismissed;
  const canChooseNewPuzzle = isHost;

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
                {multiplayerActive && shareCode && (
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-neutral-400 hidden sm:inline">{t('playing.room')}</span>
                      <span className="font-mono font-bold text-sm text-neutral-700 tracking-wider">
                        {shareCode}
                      </span>
                    </div>
                    <div className="hidden md:block">
                      <QRCode
                        value={`${window.location.origin}/?join=${shareCode}`}
                        size={48}
                        title={t('lobby.qrCodeLabel')}
                      />
                    </div>
                  </div>
                )}
                {multiplayerActive && isHost ? (
                  <button
                    onClick={handleCloseRoom}
                    className="text-sm px-2.5 md:px-3 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
                  >
                    <span className="md:hidden">{t('playing.close')}</span>
                    <span className="hidden md:inline">{t('playing.closeRoom')}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleReset}
                    className="text-sm px-2.5 md:px-3 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-600 transition-colors"
                  >
                    <span className="md:hidden">{t('playing.leave')}</span>
                    <span className="hidden md:inline">{t('playing.leaveGame')}</span>
                  </button>
                )}
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
              playerColorMap={playerColorMap}
              completedClues={completedClues}
              navigationActions={navActions}
              rejectedCell={rejectedCell}
              inputRef={gridInputRef}
            />
            {multiplayerActive && <LockoutOverlay lockedUntil={lockedUntil} />}
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
                <MultiplayerScoreboard
                  players={multiplayerPlayers}
                  totalCells={totalWhiteCells}
                  isComplete={gameComplete}
                />
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
            <MultiplayerScoreboard
              players={multiplayerPlayers}
              totalCells={totalWhiteCells}
              isComplete={gameComplete}
            />
          </div>
        }
      />
      <CompletionModal
        open={showCompletionModal}
        totalCells={totalWhiteCells}
        totalClues={puzzle.clues.length}
        players={playerResults}
        onNewPuzzle={canChooseNewPuzzle ? handleNewPuzzle : undefined}
        onBackToMenu={handleBackToMenu}
      />
    </>
  );
}
