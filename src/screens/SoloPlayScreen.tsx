import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { CrosswordGrid, useGridNavigation } from "../components/CrosswordGrid";
import { Flag } from "lucide-react";
import { ActiveClueCard, CluePanel } from "../components/CluePanel";
import { buttonClass } from "../components/ui";
import { MobileClueBar, MobileClueSheet } from "../components/ClueBar";
import { GameLayout } from "../components/Layout/GameLayout";
import { PuzzleKeyboard } from "../components/CrosswordGrid/PuzzleKeyboard";
import { Scoreboard } from "../components/Scoreboard/Scoreboard";
import { CompletionModal } from "../components/CompletionModal";
import { SoloTimer } from "../components/SoloTimer";
import { FinishedBar } from "../components/FinishedBar";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import { useAccountContext } from "../contexts/AccountContext";
import { clearMpSession } from "../lib/sessionPersistence";
import { clearSoloTimer, dayKey, effectiveStreak, formatDuration, puzzleIdentity, recordNytPlay } from "../lib/soloStats";
import { recordSolve, type SolveOutcome } from "../lib/solveHistory";
import { useSolveHistory } from "../hooks/useSolveHistory";
import { useTodaysDailySlot } from "../hooks/useDailyMini";
import { useNextUp } from "../hooks/useNextUp";
import type { NextUpItem } from "../lib/nextUp";
import { loadClassicPuzzle } from "../lib/classicLibrary";
import { pickerPath } from "./PuzzlePickerScreen";
import { usePlayInsights } from "../hooks/usePlayInsights";
import { leaderboardPath, submitDailyResult, todayKey, updateDailyDisplayName } from "../lib/dailyLeaderboard";
import { isRealPlayerName, savePlayerName } from "../lib/playerName";
import { loadChallenge, clearChallenge, compareToChallenge } from "../lib/challenge";
import { useSoloTimer } from "../hooks/useSoloTimer";
import { track } from "../lib/analytics";
import type { PuzzleClue } from "../types/puzzle";
import { firstEmptyCell } from "../lib/gridUtils";

export function SoloPlayScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const game = useGame();
  const mp = useMultiplayerContext();
  const { user } = useAuth();
  const account = useAccountContext();

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

  const { soloInputLetter, rejectedCell, wrongLetters, wrongCells, completedClues } = mp;

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
  const { getElapsedSeconds, running: timerRunning, result: soloResult, fresh: freshResult } = useSoloTimer(
    puzzle,
    isComplete,
  );
  const fromNyt = puzzle?.origin === "nyt-bookmarklet";

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

  // Post a finished daily (mini or large) to its cross-day leaderboard
  // (best-effort, no-op offline). Keyed by puzzle identity so imported
  // puzzles never post.
  const dailySlot = useTodaysDailySlot(puzzle);
  const isDaily = dailySlot !== null;
  usePlayInsights({
    puzzle,
    playerCells,
    direction,
    activeClue,
    wrongLetters,
    isComplete,
    mode: "solo",
    source: isDaily ? "daily" : puzzle?.origin === "nyt-bookmarklet" ? "nyt" : "other",
    signedIn: !!user && !user.is_anonymous,
  });
  // The finish is also parked in context as a pending result, so the board
  // can await the round trip instead of racing it (audit §3, item 9).
  const dailySubmittedRef = useRef(false);
  const setPendingDailyResult = game.setPendingDailyResult;
  useEffect(() => {
    if (!soloResult || dailySubmittedRef.current) return;
    if (!dailySlot || !user) return;
    dailySubmittedRef.current = true;
    const day = todayKey();
    const entry = { userId: user.id, displayName: game.displayName, mode: "solo" as const, seconds: Math.max(0, Math.floor(soloResult.finishSeconds)) };
    const settled = submitDailyResult({ day, slot: dailySlot, ...entry, gameId: game.gameId });
    setPendingDailyResult({ day, slot: dailySlot, entry, settled });
  }, [soloResult, dailySlot, user, game.displayName, game.gameId, setPendingDailyResult]);

  // "Up next" moves the next daily into THIS screen, so everything latched
  // "once per puzzle" above resets when the puzzle changes.
  const puzzleKey = puzzle ? puzzleIdentity(puzzle) : null;
  useEffect(() => {
    dailySubmittedRef.current = false;
    historyRecordedRef.current = false;
    completionReportedRef.current = false;
    setServerOutcome(null);
    setBoardSignedAs(null);
    setNytStreak(null);
  }, [puzzleKey]);

  // Signed-in solvers: file the finish in the account's solve history and
  // judge best time and streak against that history, which every device
  // shares, instead of this device's stats. A restored (reloaded) finish is
  // not re-filed; it reads the loaded history instead.
  const accountId = account.user?.id;
  const history = useSolveHistory();
  const [serverOutcome, setServerOutcome] = useState<SolveOutcome | null>(null);
  const historyRecordedRef = useRef(false);
  useEffect(() => {
    if (!soloResult || !freshResult || !accountId || !puzzle || historyRecordedRef.current) return;
    historyRecordedRef.current = true;
    void recordSolve(accountId, {
      puzzleKey: puzzleIdentity(puzzle),
      title: puzzle.title,
      source: isDaily ? "daily" : fromNyt ? "nyt" : "other",
      mode: "solo",
      seconds: soloResult.finishSeconds,
    }).then((outcome) => outcome && setServerOutcome(outcome));
  }, [soloResult, freshResult, accountId, puzzle, isDaily, fromNyt]);

  const shownResult = useMemo(() => {
    if (!soloResult) return null;
    if (serverOutcome) {
      return {
        bestSeconds: serverOutcome.bestSeconds ?? soloResult.bestSeconds,
        isNewBest: serverOutcome.isNewBest,
        previousBest: serverOutcome.previousBest,
        streak: serverOutcome.streak.current,
        nytStreak: serverOutcome.nytStreak.current,
      };
    }
    if (!freshResult && history.summary && puzzle) {
      const today = dayKey(new Date());
      return {
        bestSeconds: history.summary.bestTimes[puzzleIdentity(puzzle)] ?? soloResult.bestSeconds,
        isNewBest: false,
        previousBest: null,
        streak: effectiveStreak(history.summary.streak, today),
        nytStreak: effectiveStreak(history.summary.nytStreak, today),
      };
    }
    return {
      bestSeconds: soloResult.bestSeconds,
      isNewBest: soloResult.isNewBest,
      previousBest: soloResult.previousBest,
      streak: soloResult.streak.current,
      nytStreak: null,
    };
  }, [soloResult, serverOutcome, freshResult, history.summary, puzzle]);

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
      // The board's optimistic row shows the signed name at once.
      game.setPendingDailyResult((prev) => (prev ? { ...prev, entry: { ...prev.entry, displayName: trimmed } } : prev));
      if (user) void updateDailyDisplayName(todayKey(), user.id, trimmed, dailySlot ?? "mini");
    },
    [game, user, dailySlot],
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
      origin: puzzle?.origin,
      size: puzzle ? `${puzzle.width}x${puzzle.height}` : undefined,
      cells: totalWhiteCells,
      duration_seconds: getElapsedSeconds(),
    });
  }, [isComplete, puzzle, totalWhiteCells, getElapsedSeconds]);

  // NYT-bookmarklet return loop: finishing an imported NYT puzzle rolls the
  // NYT streak (same-day repeats/reloads are no-ops) and the modal nudges
  // "same time tomorrow". Solo only needs the finish, not a server round-trip.
  const [nytStreak, setNytStreak] = useState<number | null>(null);
  useEffect(() => {
    if (!isComplete || !fromNyt || nytStreak !== null) return;
    setNytStreak(recordNytPlay().current);
  }, [isComplete, fromNyt, nytStreak]);

  const handleReset = useCallback(() => {
    reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    clearSoloTimer();
    clearChallenge();
    navigate("/menu");
  }, [reset, game, navigate]);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    handleReset();
  }, [setCompletionModalDismissed, handleReset]);

  // Leaving the finished grid for the board (or the sign-in sheet) dismisses
  // the celebration: coming back shows the solved grid with the slim finished
  // header, whose Share button re-opens the modal on demand.
  const handleViewLeaderboard = useCallback(() => {
    if (!dailySlot) return;
    setCompletionModalDismissed(true);
    navigate(leaderboardPath(dailySlot));
  }, [dailySlot, setCompletionModalDismissed, navigate]);

  const handleSignIn = useCallback(() => {
    setCompletionModalDismissed(true);
    account.openAccount({ returnTo: "/menu", placement: "completion" });
  }, [setCompletionModalDismissed, account]);

  const reopenCompletion = useCallback(() => setCompletionModalDismissed(false), [setCompletionModalDismissed]);

  // "Up next" (audit §2, item 8): today's other dailies, else a classic, else
  // the library. A daily or classic loads straight into this screen, the same
  // path the menu's "Play" takes.
  const nextUp = useNextUp(soloResult ? puzzleKey : null, isComplete);
  const handleNextUp = useCallback(
    async (item: NextUpItem) => {
      clearChallenge();
      if (item.kind === "library") {
        setCompletionModalDismissed(true);
        navigate("/classics");
        return;
      }
      track("mode_selected", item.kind === "daily" ? { mode: "daily", slot: item.slot, from: "completion" } : { mode: "classic", from: "completion" });
      const next = item.kind === "daily" ? item.daily.puzzle : await loadClassicPuzzle(item.entry);
      await game.handleSoloPuzzleLoaded(next);
      game.setSoloTheme(item.kind === "daily" ? item.daily.theme : null);
    },
    [game, navigate, setCompletionModalDismissed],
  );

  // "Race a friend live": a FRESH puzzle through the picker, never the one
  // just solved. The picker tears down the solo state and hands the choice to
  // the existing host flow (name → lobby with share code / QR).
  const handleRaceFresh = useCallback(() => {
    setCompletionModalDismissed(true);
    navigate(pickerPath("race"));
  }, [setCompletionModalDismissed, navigate]);

  function handleClueClick(clue: PuzzleClue) {
    // Land on the first empty cell of the word, not its first cell
    const target = puzzle ? firstEmptyCell(puzzle, playerCells, clue) : null;
    selectCell(target?.row ?? clue.row, target?.col ?? clue.col);
    setDirection(clue.direction);
    setClueSheetOpen(false);
    gridInputRef.current?.focus();
  }

  // Guard: nothing to play — back to the menu (the importer is the wrong
  // fallback in the native apps, and the menu offers every way to start).
  if (!puzzle) {
    return <Navigate to="/menu" replace />;
  }

  const showCompletionModal = isComplete && !completionModalDismissed;

  return (
    <>
      <GameLayout
        keyboard={<PuzzleKeyboard actions={navActions} disabled={isComplete || clueSheetOpen} />}
        header={
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="font-display text-lg md:text-2xl font-bold tracking-tight text-ink truncate">{puzzle.title}</h1>
                  {soloTheme && (
                    <span className="hidden sm:inline shrink-0 rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-100">
                      {t('playing.dailyThemeBadge', { theme: soloTheme })}
                    </span>
                  )}
                </div>
                {puzzle.author && (
                  <p className="hidden md:block text-sm text-muted truncate">{t('playing.by', { author: puzzle.author })}</p>
                )}
              </div>
              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                {isComplete ? (
                  <FinishedBar
                    seconds={soloResult?.finishSeconds ?? getElapsedSeconds()}
                    onShare={reopenCompletion}
                    onLeaderboard={dailySlot ? handleViewLeaderboard : undefined}
                  />
                ) : (
                  <div className="flex flex-col items-end leading-tight">
                    <SoloTimer getElapsedSeconds={getElapsedSeconds} running={timerRunning} />
                    {challenge && (
                      <span className="text-xs font-semibold text-gold-700 tabular-nums">
                        <Flag className="inline size-3 mr-1 -mt-px" aria-hidden="true" />{t('challenge.beatTarget', { time: formatDuration(challenge.seconds) })}
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={handleReset}
                  className={buttonClass("secondary", "sm")}
                >
                  <span className="md:hidden">{t('playing.newPuzzle')}</span>
                  <span className="hidden md:inline">{t('playing.loadDifferent')}</span>
                </button>
              </div>
            </div>
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
          <div className="flex flex-col gap-2 md:gap-4 h-full">
            <ActiveClueCard clue={activeClue} />
            <div className="flex-1 min-h-0">
            <CluePanel
              clues={puzzle.clues}
              activeClue={activeClue}
              onClueClick={handleClueClick}
              completedClues={completedClues}
            />
            </div>
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
        bestSeconds={shownResult?.bestSeconds}
        isNewBest={shownResult?.isNewBest}
        previousBest={shownResult?.previousBest}
        streakCount={shownResult?.streak}
        nytHook={fromNyt ? { streak: shownResult?.nytStreak ?? nytStreak ?? 0 } : undefined}
        onViewLeaderboard={dailySlot ? handleViewLeaderboard : undefined}
        dailySlot={dailySlot ?? undefined}
        dailySign={dailySign}
        challengePuzzle={puzzle}
        playerCells={playerCells}
        wrongCells={wrongCells}
        challengerName={game.displayName}
        challengeOutcome={challengeOutcome}
        nextUp={nextUp}
        onNextUp={(item) => void handleNextUp(item)}
        onRaceFresh={user ? handleRaceFresh : undefined}
        puzzleSize={`${puzzle.width}x${puzzle.height}`}
        onBackToMenu={handleBackToMenu}
        onSignIn={account.available && account.ready && !account.user ? handleSignIn : undefined}
      />
    </>
  );
}
