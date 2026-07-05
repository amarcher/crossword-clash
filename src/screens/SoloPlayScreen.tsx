import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { CrosswordGrid, useGridNavigation } from "../components/CrosswordGrid";
import { CluePanel } from "../components/CluePanel";
import { MobileClueBar, MobileClueSheet } from "../components/ClueBar";
import { GameLayout } from "../components/Layout/GameLayout";
import { Scoreboard } from "../components/Scoreboard/Scoreboard";
import { CompletionModal } from "../components/CompletionModal";
import { SoloTimer } from "../components/SoloTimer";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import { clearMpSession } from "../lib/sessionPersistence";
import { clearSoloTimer, formatDuration, puzzleIdentity } from "../lib/soloStats";
import { isTodaysDaily, submitDailyResult, todayKey, updateDailyDisplayName } from "../lib/dailyLeaderboard";
import { isRealPlayerName, savePlayerName } from "../lib/playerName";
import { loadChallenge, clearChallenge, compareToChallenge } from "../lib/challenge";
import { useSoloTimer } from "../hooks/useSoloTimer";
import { track } from "../lib/analytics";
import type { PuzzleClue } from "../types/puzzle";

export function SoloPlayScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const game = useGame();
  const mp = useMultiplayerContext();
  const { user } = useAuth();

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
    soloTheme,
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

  // Elapsed timer + personal-best / streak tracking (solo only).
  const { getElapsedSeconds, running: timerRunning, result: soloResult } = useSoloTimer(
    puzzle,
    isComplete,
  );

  // An accepted friend challenge for THIS puzzle — the ghost time to race.
  // Keyed by puzzle identity so a stale ghost never bleeds onto another puzzle.
  const challenge = useMemo(() => {
    if (!puzzle) return null;
    const stored = loadChallenge();
    return stored && stored.key === puzzleIdentity(puzzle) ? stored : null;
  }, [puzzle]);

  const challengeOutcome = useMemo(
    () =>
      challenge && soloResult
        ? {
            ...compareToChallenge(challenge.seconds, soloResult.finishSeconds),
            challengerName: challenge.name,
          }
        : undefined,
    [challenge, soloResult],
  );

  // Post a finished daily mini to the cross-day leaderboard (best-effort,
  // no-op offline). Keyed by puzzle identity so imported puzzles never post.
  const isDaily = useMemo(() => isTodaysDaily(puzzle), [puzzle]);
  const dailySubmittedRef = useRef(false);
  useEffect(() => {
    if (!soloResult || dailySubmittedRef.current) return;
    if (!isDaily || !user) return;
    dailySubmittedRef.current = true;
    void submitDailyResult({
      day: todayKey(),
      userId: user.id,
      displayName: game.displayName,
      mode: "solo",
      seconds: soloResult.finishSeconds,
      gameId: game.gameId,
    });
  }, [soloResult, isDaily, user, game.displayName, game.gameId]);

  // "Sign the board": when the daily time was submitted under the anonymous
  // default, the modal offers a one-field claim. `boardSignedAs` latches the
  // signed name so the form flips to a confirmation instead of vanishing the
  // moment displayName stops being the default.
  const [boardSignedAs, setBoardSignedAs] = useState<string | null>(null);
  const handleSignBoard = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setBoardSignedAs(trimmed);
      game.setDisplayName(trimmed);
      savePlayerName(trimmed);
      if (user) void updateDailyDisplayName(todayKey(), user.id, trimmed);
    },
    [game, user],
  );
  const dailySign =
    isDaily && user && soloResult && (boardSignedAs || !isRealPlayerName(game.displayName))
      ? { signedAs: boardSignedAs, onSign: handleSignBoard }
      : undefined;

  // Report solo completion once (isComplete latches true once the grid fills).
  const completionReportedRef = useRef(false);
  useEffect(() => {
    if (!isComplete || completionReportedRef.current) return;
    completionReportedRef.current = true;
    track("puzzle_completed", {
      mode: "solo",
      size: puzzle ? `${puzzle.width}x${puzzle.height}` : undefined,
      cells: totalWhiteCells,
      duration_seconds: getElapsedSeconds(),
    });
  }, [isComplete, puzzle, totalWhiteCells, getElapsedSeconds]);

  const handleReset = useCallback(() => {
    reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    clearSoloTimer();
    clearChallenge();
    navigate("/");
  }, [reset, game, navigate]);

  const handleNewPuzzle = useCallback(() => {
    setCompletionModalDismissed(true);
    clearChallenge();
    navigate("/solo/import");
  }, [setCompletionModalDismissed, navigate]);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    handleReset();
  }, [setCompletionModalDismissed, handleReset]);

  // Live bridge: take the finisher into the EXISTING host-as-player flow to host
  // a FRESH puzzle head-to-head (name → import → lobby with share code / QR).
  // We deliberately tear down all solo/challenge state so the next puzzle is new
  // to both players — the already-solved puzzle is never re-raced live (the
  // unfair case). No new room/realtime code: this is pure routing into the
  // existing stack. The finisher's name (if they signed one) rides along, so the
  // host name field is pre-filled.
  const handlePlayLive = useCallback(() => {
    setCompletionModalDismissed(true);
    reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    clearSoloTimer();
    clearChallenge();
    navigate("/host-game/name");
  }, [setCompletionModalDismissed, reset, game, navigate]);

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
                {soloTheme && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-700 mb-0.5">
                    {t('playing.dailyThemeBadge', { theme: soloTheme })}
                  </span>
                )}
                <h1 className="text-base md:text-xl font-bold truncate">{puzzle.title}</h1>
                {puzzle.author && (
                  <p className="hidden md:block text-sm text-neutral-500">{t('playing.by', { author: puzzle.author })}</p>
                )}
              </div>
              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                <div className="flex flex-col items-end leading-tight">
                  <SoloTimer getElapsedSeconds={getElapsedSeconds} running={timerRunning} />
                  {challenge && (
                    <span className="text-[11px] font-semibold text-amber-600 tabular-nums">
                      🏁 {t('challenge.beatTarget', { time: formatDuration(challenge.seconds) })}
                    </span>
                  )}
                </div>
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
        puzzleTitle={puzzle.title}
        totalCells={totalWhiteCells}
        totalClues={puzzle.clues.length}
        soloScore={score}
        finishSeconds={soloResult?.finishSeconds}
        bestSeconds={soloResult?.bestSeconds}
        isNewBest={soloResult?.isNewBest}
        previousBest={soloResult?.previousBest}
        streakCount={soloResult?.streak.current}
        onViewLeaderboard={isDaily ? () => navigate("/daily/leaderboard") : undefined}
        dailySign={dailySign}
        challengePuzzle={puzzle}
        challengerName={game.displayName}
        challengeOutcome={challengeOutcome}
        onPlayLive={user ? handlePlayLive : undefined}
        puzzleSize={`${puzzle.width}x${puzzle.height}`}
        onNewPuzzle={handleNewPuzzle}
        onBackToMenu={handleBackToMenu}
      />
    </>
  );
}
