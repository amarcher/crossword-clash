import { shareOrigin } from "../lib/shareOrigin";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useBeforeUnload } from "../hooks/useBeforeUnload";
import QRCode from "react-qr-code";
import { CrosswordGrid, useGridNavigation } from "../components/CrosswordGrid";
import { ActiveClueCard, CluePanel } from "../components/CluePanel";
import { buttonClass } from "../components/ui";
import { MobileClueBar, MobileClueSheet } from "../components/ClueBar";
import { GameLayout } from "../components/Layout/GameLayout";
import { PuzzleKeyboard } from "../components/CrosswordGrid/PuzzleKeyboard";
import { MultiplayerScoreboard } from "../components/Scoreboard/MultiplayerScoreboard";
import { LockoutOverlay } from "../components/LockoutOverlay";
import { CompletionModal } from "../components/CompletionModal";
import { FinishedBar } from "../components/FinishedBar";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import { useAccountContext } from "../contexts/AccountContext";
import { clearMpSession } from "../lib/sessionPersistence";
import { pickerPath } from "./PuzzlePickerScreen";
import { useTodaysDailySlot } from "../hooks/useDailyMini";
import { usePlayInsights } from "../hooks/usePlayInsights";
import { leaderboardPath, submitDailyResult, todayKey } from "../lib/dailyLeaderboard";
import { recordDailyPlay, recordNytPlay, formatDuration, puzzleIdentity } from "../lib/soloStats";
import { recordSolve } from "../lib/solveHistory";
import { rankRaceStandings } from "../lib/raceResults";
import { useConfirm } from "../components/ConfirmDialog";
import { track } from "../lib/analytics";
import type { PuzzleClue } from "../types/puzzle";
import { firstEmptyCell } from "../lib/gridUtils";

export function MultiplayerPlayScreen() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { user } = useAuth();
  const account = useAccountContext();
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
    isComplete,
    lockedUntil,
    clueSheetOpen,
    setClueSheetOpen,
    completionModalDismissed,
    setCompletionModalDismissed,
  } = game;

  const {
    multiplayerActive,
    multiplayerInputLetter,
    asyncInputLetter,
    playerColorMap,
    completedClues,
    completedCluesByPlayer,
    clueCountsByPlayer,
    multiplayerPlayers,
    playerResults,
    rejectedCell,
    wrongLetters,
    isHost,
    shareCode,
    gameStatus,
    raceSeconds,
    raceMode,
    raceFinishTimes,
    finishRace,
  } = mp;

  const isAsync = raceMode === "async";
  const isCoop = raceMode === "coop";

  useBeforeUnload(gameStatus === "active");

  const gridInputRef = useRef<HTMLInputElement>(null);

  const navActions = useMemo(
    () => ({
      // Async: validate against the LOCAL copy only (no claims/broadcasts) —
      // one player's letters never appear on another's grid.
      inputLetter: isAsync ? asyncInputLetter : multiplayerInputLetter,
      deleteLetter: () => {}, // No deletion in multiplayer
      moveSelection,
      nextWord,
      prevWord,
      toggleDirection,
    }),
    [isAsync, asyncInputLetter, multiplayerInputLetter, moveSelection, nextWord, prevWord, toggleDirection],
  );

  useGridNavigation(navActions);

  // Async: filling my own copy IS my finish — record + broadcast it once.
  const myFinishSeconds = user ? raceFinishTimes[user.id] : undefined;
  const raceFinishedRef = useRef(false);
  useEffect(() => {
    if (!isAsync || !isComplete || raceFinishedRef.current) return;
    if (gameStatus !== "active" && gameStatus !== "completed") return;
    raceFinishedRef.current = true;
    finishRace();
  }, [isAsync, isComplete, gameStatus, finishRace]);

  // Async standings, ranked by finish time (still-solving players trail).
  const raceStandings = useMemo(
    () => (isAsync ? rankRaceStandings(multiplayerPlayers, raceFinishTimes) : undefined),
    [isAsync, multiplayerPlayers, raceFinishTimes],
  );

  // Report multiplayer completion once per finished game (per client).
  const completionReportedRef = useRef(false);
  useEffect(() => {
    if (gameStatus !== "completed") {
      completionReportedRef.current = false;
      return;
    }
    if (completionReportedRef.current) return;
    completionReportedRef.current = true;
    track("puzzle_completed", {
      mode: "multiplayer",
      race_mode: raceMode,
      role: isHost ? "host" : "player",
      player_count: multiplayerPlayers.length,
      duration_seconds: (isAsync ? myFinishSeconds : raceSeconds) ?? undefined,
    });
  }, [gameStatus, isHost, multiplayerPlayers.length, raceSeconds, raceMode, isAsync, myFinishSeconds]);

  // Daily-mini return loop. Async race times are the leaderboard's currency:
  // each finisher posts their OWN time. Shared-grid modes (versus/coop) roll
  // the streak but do NOT post times — a team-shared grid time isn't
  // comparable to individual solves.
  const dailySlot = useTodaysDailySlot(puzzle);
  const isDaily = dailySlot !== null;
  usePlayInsights({
    puzzle,
    playerCells,
    direction,
    activeClue,
    wrongLetters,
    isComplete,
    mode: raceMode,
    source: isDaily ? "daily" : puzzle?.origin === "nyt-bookmarklet" ? "nyt" : "other",
    localPlayerId: user?.id,
    active: gameStatus !== "waiting",
    signedIn: !!user && !user.is_anonymous,
  });
  const dailySubmittedRef = useRef(false);
  const setPendingDailyResult = game.setPendingDailyResult;
  useEffect(() => {
    if (dailySubmittedRef.current || !dailySlot || !user) return;
    if (isAsync) {
      if (myFinishSeconds === undefined) return;
      dailySubmittedRef.current = true;
      recordDailyPlay();
      // Parked in context too, so the board awaits the post (audit §3, item 9).
      const day = todayKey();
      const entry = { userId: user.id, displayName: game.displayName, mode: "race" as const, seconds: Math.max(0, Math.floor(myFinishSeconds)) };
      const settled = submitDailyResult({ day, slot: dailySlot, ...entry, gameId: game.gameId });
      setPendingDailyResult({ day, slot: dailySlot, entry, settled });
      return;
    }
    if (gameStatus !== "completed") return;
    dailySubmittedRef.current = true;
    recordDailyPlay();
  }, [gameStatus, dailySlot, user, isAsync, myFinishSeconds, game.displayName, game.gameId, setPendingDailyResult]);

  // NYT-bookmarklet return loop (mirrors SoloPlayScreen): a finished NYT
  // puzzle rolls the NYT streak for everyone in the room, including friends
  // who joined via a share link — the modal then tells them how to get
  // tomorrow's puzzle themselves.
  const fromNyt = puzzle?.origin === "nyt-bookmarklet";
  const [nytStreak, setNytStreak] = useState<number | null>(null);
  useEffect(() => {
    if (!fromNyt || nytStreak !== null) return;
    const finished = isAsync ? myFinishSeconds !== undefined : gameStatus === "completed";
    if (!finished) return;
    setNytStreak(recordNytPlay().current);
  }, [fromNyt, nytStreak, isAsync, myFinishSeconds, gameStatus]);

  // Signed-in solvers: file the finish in the account's solve history. An
  // async race carries a personal time; a shared-grid finish (versus, co-op)
  // has none and counts toward streaks only. Once per game: a rematch is a
  // new game id.
  const accountId = account.user?.id;
  const [serverNytStreak, setServerNytStreak] = useState<number | null>(null);
  const historyRecordedRef = useRef(false);
  useEffect(() => {
    historyRecordedRef.current = false;
    setServerNytStreak(null);
  }, [game.gameId]);
  useEffect(() => {
    if (!accountId || !puzzle || historyRecordedRef.current) return;
    const finished = isAsync ? myFinishSeconds !== undefined : gameStatus === "completed";
    if (!finished) return;
    historyRecordedRef.current = true;
    void recordSolve(accountId, {
      puzzleKey: puzzleIdentity(puzzle),
      title: puzzle.title,
      source: dailySlot ? "daily" : fromNyt ? "nyt" : "other",
      mode: raceMode,
      seconds: isAsync ? (myFinishSeconds ?? null) : null,
    }).then((outcome) => {
      if (outcome && fromNyt) setServerNytStreak(outcome.nytStreak.current);
    });
  }, [accountId, puzzle, isAsync, myFinishSeconds, gameStatus, dailySlot, fromNyt, raceMode]);

  const handleReset = useCallback(async () => {
    await mp.leaveGame();
    reset();
    game.setGameId(null);
    game.setIsMultiplayer(false);
    localStorage.removeItem(STORAGE_KEY);
    clearMpSession();
    navigate("/menu");
  }, [mp, reset, game, navigate]);

  const handleCloseRoom = useCallback(async () => {
    const ok = await confirm({
      title: t('playing.closeRoomConfirm'),
      confirmLabel: t('playing.closeRoom'),
      tone: 'danger',
    });
    if (!ok) return;
    await mp.closeRoom();
    handleReset();
  }, [mp, handleReset, confirm, t]);

  // "Next puzzle, same room" (audit §2, item 6): the picker chooses a FRESH
  // puzzle and calls createNextGame with ITS id, so the room code stays and
  // nobody replays the grid they have all just seen.
  const handleNextPuzzle = useCallback(() => {
    setCompletionModalDismissed(true);
    navigate(pickerPath("next"));
  }, [setCompletionModalDismissed, navigate]);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    handleReset();
  }, [setCompletionModalDismissed, handleReset]);

  // Leaving the finished grid for the board (or the sign-in sheet) dismisses
  // the celebration; the header's finished state can re-open it.
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

  function handleClueClick(clue: PuzzleClue) {
    // Land on the first empty cell of the word, not its first cell
    const target = puzzle ? firstEmptyCell(puzzle, playerCells, clue) : null;
    selectCell(target?.row ?? clue.row, target?.col ?? clue.col);
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
  // Async: your race ends when YOU finish — show your result immediately and
  // let the standings update live as others come in.
  const finished = isAsync ? multiplayerActive && myFinishSeconds !== undefined : multiplayerIsComplete;
  const showCompletionModal = finished && !completionModalDismissed;
  const finishSeconds = isAsync ? myFinishSeconds ?? null : raceSeconds;
  const canChooseNewPuzzle = isHost;

  // Async sidebar: live standings instead of the cells-claimed scoreboard
  // (other players' grids are invisible, so cell counts are meaningless).
  const raceStatusPanel = raceStandings && (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
        {t('completion.standings')}
      </h2>
      {raceStandings.map((row) => (
        <div
          key={row.userId}
          className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-neutral-200 text-sm"
        >
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
          <span className="font-medium text-neutral-700 truncate flex-1">{row.displayName}</span>
          <span className="tabular-nums text-neutral-500">
            {row.seconds != null ? formatDuration(row.seconds) : t('completion.solving')}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <GameLayout
        keyboard={<PuzzleKeyboard actions={navActions} allowDelete={false} disabled={isComplete || clueSheetOpen || gameStatus !== "active"} />}
        header={
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="font-display text-lg md:text-2xl font-bold tracking-tight text-ink truncate">{puzzle.title}</h1>
                {puzzle.author && (
                  <p className="hidden md:block text-sm text-muted truncate">{t('playing.by', { author: puzzle.author })}</p>
                )}
              </div>
              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                {finished && (
                  <FinishedBar
                    seconds={finishSeconds}
                    onShare={reopenCompletion}
                    onLeaderboard={dailySlot ? handleViewLeaderboard : undefined}
                  />
                )}
                {/* The room code is for joining mid-game; once finished the finished state takes its place. */}
                {multiplayerActive && shareCode && !finished && (
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-subtle hidden sm:inline">{t('playing.room')}</span>
                      <span className="rounded-lg bg-surface-sunken px-2 py-1 font-mono font-bold text-sm text-ink tracking-wider">
                        {shareCode}
                      </span>
                    </div>
                    <div className="hidden md:block">
                      <QRCode
                        value={`${shareOrigin()}/?join=${shareCode}`}
                        size={48}
                        title={t('lobby.qrCodeLabel')}
                      />
                    </div>
                  </div>
                )}
                {multiplayerActive && isHost ? (
                  <button
                    onClick={handleCloseRoom}
                    className={buttonClass("danger", "sm")}
                  >
                    <span className="md:hidden">{t('playing.close')}</span>
                    <span className="hidden md:inline">{t('playing.closeRoom')}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleReset}
                    className={buttonClass("secondary", "sm")}
                  >
                    <span className="md:hidden">{t('playing.leave')}</span>
                    <span className="hidden md:inline">{t('playing.leaveGame')}</span>
                  </button>
                )}
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
              playerColorMap={playerColorMap}
              localPlayerId={user?.id}
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
                isAsync ? (
                  raceStatusPanel
                ) : (
                  <MultiplayerScoreboard
                    players={multiplayerPlayers}
                    totalCells={totalWhiteCells}
                    isComplete={gameComplete}
                    clueCountsByPlayer={clueCountsByPlayer}
                    totalClues={puzzle.clues.length}
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
          <div className="flex flex-col gap-2 md:gap-4 h-full">
            <ActiveClueCard clue={activeClue} />
            <div className="flex-1 min-h-0">
            <CluePanel
              clues={puzzle.clues}
              activeClue={activeClue}
              onClueClick={handleClueClick}
              completedClues={completedClues}
              completedCluesByPlayer={completedCluesByPlayer}
              playerColorMap={playerColorMap}
            />
            </div>
            {isAsync ? (
              raceStatusPanel
            ) : (
              <MultiplayerScoreboard
                players={multiplayerPlayers}
                totalCells={totalWhiteCells}
                isComplete={gameComplete}
              />
            )}
          </div>
        }
      />
      <CompletionModal
        open={showCompletionModal}
        puzzleTitle={puzzle.title}
        totalCells={totalWhiteCells}
        totalClues={puzzle.clues.length}
        players={playerResults}
        currentUserId={user?.id}
        raceSeconds={finishSeconds}
        raceStandings={raceStandings}
        coop={isCoop}
        nytHook={fromNyt ? { streak: serverNytStreak ?? nytStreak ?? 0 } : undefined}
        onViewLeaderboard={dailySlot ? handleViewLeaderboard : undefined}
        dailySlot={dailySlot ?? undefined}
        onNextPuzzle={canChooseNewPuzzle ? handleNextPuzzle : undefined}
        onBackToMenu={handleBackToMenu}
        onSignIn={account.available && account.ready && !account.user ? handleSignIn : undefined}
      />
    </>
  );
}
