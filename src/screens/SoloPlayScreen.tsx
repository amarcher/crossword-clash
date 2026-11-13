import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, UNSAFE_DataRouterContext } from "react-router";
import { useTranslation } from "react-i18next";
import { CrosswordGrid, useGridNavigation } from "../components/CrosswordGrid";
import { Flag, Pause, X } from "lucide-react";
import { ActiveClueCard, CluePanel } from "../components/CluePanel";
import { buttonClass } from "../components/ui";
import { MobileClueBar, MobileClueSheet } from "../components/ClueBar";
import { GameLayout } from "../components/Layout/GameLayout";
import { PuzzleKeyboard } from "../components/CrosswordGrid/PuzzleKeyboard";
import { Scoreboard } from "../components/Scoreboard/Scoreboard";
import { CompletionModal } from "../components/CompletionModal";
import { SoloTimer } from "../components/SoloTimer";
import { FinishedBar } from "../components/FinishedBar";
import { SolvedStrip } from "../components/FinishedBar/SolvedStrip";
import { useConfirm } from "../components/ConfirmDialog";
import { solvedSeconds } from "../lib/solvedPuzzles";
import { AccountControl } from "../components/Account/AccountControl";
import { AutocheckSwitch, HapticsSwitch, SoloOptions } from "../components/SoloOptions";
import { useSoloSettings } from "../lib/soloSettings";
import { useGame } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import { useAccountContext } from "../contexts/AccountContext";

import { dayKey, effectiveStreak, formatDuration, puzzleIdentity, recordNytPlay } from "../lib/soloStats";
import { recordSolve, type SolveOutcome } from "../lib/solveHistory";
import { useSolveHistory } from "../hooks/useSolveHistory";
import { useTodaysDailySlot } from "../hooks/useDailyMini";
import { useNextUp } from "../hooks/useNextUp";
import type { NextUpItem } from "../lib/nextUp";
import { fetchDailyForDay } from "../lib/dailyFeed";
import { getProgress, saveAttempt } from "../lib/soloProgress";
import { consumeSoloStart, rememberSoloLanding } from "../lib/soloSession";
import { watchSoloLifecycle } from "../lib/soloLifecycle";
import { SoloNavigationGuard } from "../components/SoloNavigationGuard";
import { SoloPause } from "../components/SoloPause";
import { pickerPath } from "./PuzzlePickerScreen";
import { usePlayInsights } from "../hooks/usePlayInsights";
import { boardPostsHere, leaderboardPath, prepareSoloDailyResult, pendingResultFor, dailyPostingNotice, signDailyResult, todayKey, type PendingDailyResult } from "../lib/dailyLeaderboard";
import { isRealPlayerName, savePlayerName } from "../lib/playerName";
import { loadChallenge, clearChallenge, compareToChallenge } from "../lib/challenge";
import { useSoloTimer } from "../hooks/useSoloTimer";
import { track } from "../lib/analytics";
import type { PuzzleClue, PuzzleRef } from "../types/puzzle";
import { firstEmptyCell, getFilledClues } from "../lib/gridUtils";
import { useGhosts, useRaceCandidates, useSolveRecorder } from "../hooks/useRace";
import { fetchSolveTrace, GHOST_COLORS, loadRace, raceResults, saveRace, saveSolveTrace, saveTrace, takeRaceIntent, type Ghost } from "../lib/race";
import { RaceStarter } from "../components/Race/RaceStarter";
import { RaceGhosts } from "../components/Race/RaceGhosts";
import { ReplayDialog, type ReplaySolve } from "../components/Race/ReplayDialog";
import { encodeReplay } from "../lib/replayCode";
import { createReplayShare, fetchReplayShare, letteredReplay, rememberReplay, rememberedReplay } from "../lib/replayShare";
import { replyToRace } from "../lib/raceReplies";
import { buildPuzzleLink } from "../lib/dailyChallenge";
import { SHARE_URL } from "../lib/resultCard";

/** The viewer's own solve beside someone else's in a race replay: the brand blue. */
const MY_REPLAY_COLOR = "#3a6bf0";

export function SoloPlayScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
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
    clueSheetOpen,
    setClueSheetOpen,
    completionModalDismissed,
    setCompletionModalDismissed,
    soloTheme,
    autocheck,
    checkCells,
    revealCell,
  } = game;

  const { soloInputLetter, rejectedCell, wrongLetters, wrongCells, completedClues: correctClues } = mp;
  const { setAutocheck } = useSoloSettings();

  // Autocheck off (soloSettings.ts): a square with any letter is "filled" to
  // the solver, so the clue list strikes through typed words, the scoreboard
  // counts typed squares, and only Check / the finish tells wrong from right.
  const completedClues = useMemo(
    () => (autocheck || !puzzle ? correctClues : getFilledClues(puzzle, playerCells)),
    [autocheck, puzzle, playerCells, correctClues],
  );
  const { filled, wrong, assisted: revealedNow } = useMemo(() => {
    let filled = 0;
    let wrong = 0;
    let assisted = false;
    for (const c of Object.values(playerCells)) {
      if (!c.letter) continue;
      filled++;
      if (!c.correct) wrong++;
      if (c.revealed) assisted = true;
    }
    return { filled, wrong, assisted };
  }, [playerCells]);

  const key = puzzle ? puzzleIdentity(puzzle) : null;
  const restoredAttempt = key ? getProgress(key) : null;
  const assisted = revealedNow || !!restoredAttempt?.assisted;
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

  // Elapsed timer + personal-best / streak tracking (solo only). A finish with
  // a revealed square is "assisted": solved, but no record and no streak.
  // Opened already solved (GameContext.reopenedSolved): the grid is the
  // solution and the visit is a look at it, not a finish — nothing below
  // records, posts or reports it. "Clear and solve again" ends that state.
  const reopened = !!key && game.reopenedSolved?.key === key;
  const { getElapsedSeconds, getElapsedMs, running: timerRunning, result: soloResult, fresh: freshResult, pause, resume, save: saveTimer, saveFailed: timerSaveFailed, restart: restartTimer } = useSoloTimer(
    puzzle,
    isComplete,
    assisted,
    consumeSoloStart,
    game.reopenedSolved,
  );
  const paused = !!puzzle && !isComplete && !timerRunning;
  const inputAllowed = useRef(false);
  inputAllowed.current = timerRunning && !isComplete;
  const guardedActions = useMemo(() => ({
    inputLetter: (letter: string) => { if (inputAllowed.current) navActions.inputLetter(letter); },
    deleteLetter: () => { if (inputAllowed.current) navActions.deleteLetter(); },
    moveSelection: (dr: number, dc: number) => { if (inputAllowed.current) navActions.moveSelection(dr, dc); },
    nextWord: () => { if (inputAllowed.current) navActions.nextWord(); },
    prevWord: () => { if (inputAllowed.current) navActions.prevWord(); },
    toggleDirection: () => { if (inputAllowed.current) navActions.toggleDirection(); },
  }), [navActions]);
  useGridNavigation(guardedActions);
  const [saveFailed, setSaveFailed] = useState(false);
  const checkpointSolo = game.checkpointSolo;
  const checkpoint = useCallback(() => {
    const cellsSaved = checkpointSolo() === "saved";
    const clockSaved = saveTimer();
    setSaveFailed(!cellsSaved || !clockSaved);
    return cellsSaved && clockSaved;
  }, [checkpointSolo, saveTimer]);
  const handlePause = useCallback(() => {
    inputAllowed.current = false;
    pause();
    checkpoint();
    setClueSheetOpen(false);
    gridInputRef.current?.blur();
  }, [pause, checkpoint, setClueSheetOpen]);
  const handleResume = useCallback(() => {
    resume();
    requestAnimationFrame(() => gridInputRef.current?.focus());
  }, [resume]);
  useEffect(() => {
    if (account.sheetOpen && !isComplete) handlePause();
  }, [account.sheetOpen, isComplete, handlePause]);
  useEffect(() => {
    if (!paused) return;
    setClueSheetOpen(false);
    gridInputRef.current?.blur();
  }, [paused, setClueSheetOpen]);
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

  // Post a finished daily (mini, midi or large) to its cross-day leaderboard
  // (best-effort, no-op offline and off the production origin). Keyed by
  // puzzle identity so imported puzzles never post. Guests explicitly sign;
  // accounts honor their saved leaderboard preference.
  const dailySlot = useTodaysDailySlot(puzzle);
  const isDaily = dailySlot !== null;
  // Whether this solve was ever typed freely: Autocheck off while the grid was
  // unfinished, or wrong letters restored from such a visit. Recorded with the
  // play-insights row and the daily board entry; reset per puzzle below.
  const [usedFreeTyping, setUsedFreeTyping] = useState(false);
  usePlayInsights({
    puzzle,
    playerCells,
    direction,
    activeClue,
    wrongLetters,
    isComplete,
    mode: "solo",
    active: !reopened && (timerRunning || isComplete),
    source: isDaily ? "daily" : puzzle?.origin === "nyt-bookmarklet" ? "nyt" : puzzle?.origin === "community" ? "community" : "other",
    signedIn: !!user && !user.is_anonymous,
    autocheck: !usedFreeTyping,
  });
  // The finish is also parked in context as a pending result, so the board
  // can await the round trip instead of racing it (audit §3, item 9).
  const dailySubmittedRef = useRef(false);
  // Whether this puzzle had a recorded finish when the attempt on screen began.
  const solvedBeforeRef = useRef(false);
  const setPendingDailyResult = game.setPendingDailyResult;
  useEffect(() => {
    if (!soloResult || dailySubmittedRef.current) return;
    if (reopened || !dailySlot || !user) return;
    dailySubmittedRef.current = true;
    // A second solve of a puzzle already solved is made knowing the answers:
    // it may set a personal best, it never goes on the day's board.
    if (freshResult && solvedBeforeRef.current) return;
    // A finish that used Reveal posts no time: the board is for solves.
    if (soloResult.assisted) return;
    const entry = { userId: user.id, displayName: game.displayName, mode: "solo" as const, seconds: Math.max(0, Math.floor(soloResult.finishSeconds)), autocheck: !usedFreeTyping };
    const day = todayKey();
    const pending: PendingDailyResult = { day, slot: dailySlot, entry, gameId: null, posted: false, postingHold: "checking", settled: Promise.resolve() };
    pending.settled = prepareSoloDailyResult(day, dailySlot, entry, user).then(result => {
      setPendingDailyResult(current => current === pending ? result : current);
      return result.settled;
    });
    setPendingDailyResult(pending);
  }, [soloResult, freshResult, reopened, dailySlot, user, game.displayName, game.gameId, setPendingDailyResult, usedFreeTyping]);

  // The share block's red squares (shareBlock.ts): with Autocheck on, the
  // squares where a wrong letter was refused; off, every square a check
  // judged wrong or the solver revealed — remembered here because a retyped
  // square is a new CellState without the mark.
  const [flaggedCells, setFlaggedCells] = useState<string[]>([]);
  // "Up next" moves the next daily into THIS screen, so everything latched
  // "once per puzzle" above resets when the puzzle changes.
  const puzzleKey = puzzle ? puzzleIdentity(puzzle) : null;
  // ...and when the same puzzle is started over ("Clear and solve again").
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    dailySubmittedRef.current = false;
    solvedBeforeRef.current = !!puzzleKey && solvedSeconds(puzzleKey) !== null;
    historyRecordedRef.current = false;
    traceFiledRef.current = false;
    completionReportedRef.current = false;
    setServerOutcome(null);
    setBoardSignedAs(null);
    setNytStreak(null);
    const saved = puzzleKey ? getProgress(puzzleKey) : null;
    setUsedFreeTyping(!!saved?.usedFreeTyping);
    setFlaggedCells(saved?.flaggedCells ?? []);
  }, [puzzleKey, attempt]);
  // Declared after the reset above so a puzzle change re-latches in order.
  useEffect(() => {
    if ((!autocheck && !isComplete) || wrong > 0) setUsedFreeTyping(true);
  }, [autocheck, isComplete, wrong, puzzleKey]);

  useEffect(() => {
    const keys = Object.entries(playerCells)
      .filter(([, c]) => c.checked === "wrong" || c.revealed)
      .map(([k]) => k);
    if (keys.length === 0) return;
    setFlaggedCells((prev) => {
      const add = keys.filter((k) => !prev.includes(k));
      return add.length ? [...prev, ...add] : prev;
    });
  }, [playerCells]);
  useEffect(() => {
    if (!puzzleKey || isComplete) return;
    const saved = getProgress(puzzleKey);
    if (saved && (usedFreeTyping || flaggedCells.length)) saveAttempt({ ...saved, usedFreeTyping: saved.usedFreeTyping || usedFreeTyping, flaggedCells: [...new Set([...(saved.flaggedCells ?? []), ...flaggedCells])] });
  }, [puzzleKey, isComplete, usedFreeTyping, flaggedCells]);
  const shareWrongCells = useMemo(
    () => (flaggedCells.length ? [...new Set([...wrongCells, ...flaggedCells])] : wrongCells),
    [wrongCells, flaggedCells],
  );

  // Races and replays of recorded solves (race.ts; Plus). Every solo solve is
  // recorded; an account's finish files its recording for others to race.
  const width = puzzle?.width ?? 0;
  const recorder = useSolveRecorder({ puzzleKey, width, playerCells, getElapsedMs, enabled: !reopened });
  // For the share replay: the clue the solver is on, and each letter Autocheck
  // refuses (counted as it happens, on the square under the cursor).
  const recordMark = recorder.mark;
  useEffect(() => {
    if (!activeClue || !timerRunning || isComplete) return;
    recordMark(activeClue.row * width + activeClue.col, activeClue.direction === "across" ? "a" : "d");
  }, [activeClue, timerRunning, isComplete, width, recordMark]);
  const refusals = useRef(wrongLetters);
  useEffect(() => {
    const before = refusals.current;
    refusals.current = wrongLetters;
    if (wrongLetters > before && selectedCell && !isComplete) recordMark(selectedCell.row * width + selectedCell.col, "r");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new refusal is the trigger; the cursor is read at that moment
  }, [wrongLetters]);
  const [race, setRace] = useState<Ghost[]>([]);
  useEffect(() => {
    setRace(puzzleKey ? loadRace(puzzleKey)?.ghosts ?? [] : []);
  }, [puzzleKey, attempt]);
  // A Race tap on the daily board names who to race once the puzzle opens.
  const [raceIntent, setRaceIntent] = useState<string[]>([]);
  useEffect(() => {
    setRaceIntent(puzzleKey ? takeRaceIntent(puzzleKey) : []);
  }, [puzzleKey]);
  const raceCandidates = useRaceCandidates(puzzleKey, !reopened);
  const plus = account.plus;
  const racing = race.length > 0 && !isComplete;
  const { frames: ghostFrames, tints: ghostTintMap } = useGhosts(race, getElapsedMs, timerRunning && !isComplete, width);
  const openRacePitch = useCallback(() => account.openPaywall({ placement: "race", feature: "race" }), [account]);
  const startRace = useCallback(
    async (userIds: string[]): Promise<boolean> => {
      if (!puzzleKey) return false;
      try {
        const traces = await Promise.all(userIds.map((id) => fetchSolveTrace(id, puzzleKey)));
        const ghosts: Ghost[] = [];
        traces.forEach((trace, i) => {
          const who = raceCandidates.find((c) => c.userId === userIds[i]);
          if (!trace || !who || trace.events.length === 0) return;
          ghosts.push({ userId: who.userId, name: who.username, color: GHOST_COLORS[ghosts.length % GHOST_COLORS.length], seconds: trace.seconds, events: trace.events });
        });
        if (ghosts.length === 0) return false;
        saveRace({ key: puzzleKey, ghosts });
        setRace(ghosts);
        // The race starts with the grid untouched: both clocks from zero.
        restartTimer();
        recorder.reset();
        track("race_started", { ghosts: ghosts.length, friends: ghosts.filter((g) => raceCandidates.find((c) => c.userId === g.userId)?.friend).length });
        requestAnimationFrame(() => gridInputRef.current?.focus());
        return true;
      } catch {
        return false;
      }
    },
    [puzzleKey, raceCandidates, restartTimer, recorder],
  );
  const showRaceStarter =
    raceCandidates.length > 0 && race.length === 0 && !isComplete && !reopened && filled === 0 && !solvedBeforeRef.current;

  // Watching a recorded solve, letters and all, once this one is finished.
  const [replay, setReplay] = useState<ReplaySolve[] | null>(null);
  // Watching someone just raced: their solve beside this one, on one clock (both sides have finished).
  const withMine = useCallback(
    (theirs: ReplaySolve): ReplaySolve[] => {
      const mine = soloResult ? recorder.take() : null;
      return mine && soloResult ? [{ name: t("ghostRace.you"), color: MY_REPLAY_COLOR, seconds: soloResult.finishSeconds, events: mine.events }, theirs] : [theirs];
    },
    [soloResult, recorder, t],
  );
  const replayable = useMemo(() => {
    const seen = new Set<string>();
    const out: { userId: string; name: string }[] = [];
    const add = (userId: string, name: string) => {
      if (seen.has(userId)) return;
      seen.add(userId);
      out.push({ userId, name });
    };
    for (const g of race) add(g.userId, g.name);
    for (const c of raceCandidates) add(c.userId, c.username);
    return out.slice(0, 3);
  }, [race, raceCandidates]);
  const watchReplay = useCallback(
    async (userId: string) => {
      if (!puzzleKey || !puzzle) return;
      const who = replayable.find((r) => r.userId === userId);
      const color = race.find((g) => g.userId === userId)?.color ?? GHOST_COLORS[0];
      // A shared link's sender (userId "link:<share id>"), free like the race:
      // their letters are rebuilt from the replay code and the puzzle.
      if (userId.startsWith("link:")) {
        const code = await fetchReplayShare(userId.slice(5));
        const rebuilt = code ? letteredReplay(code, puzzle) : null;
        if (rebuilt) {
          setReplay(withMine({ name: who?.name ?? "", color, ...rebuilt }));
          track("replay_watched", { racing: true });
        }
        return;
      }
      if (!plus) {
        openRacePitch();
        return;
      }
      try {
        let trace = await fetchSolveTrace(userId, puzzleKey);
        // The finish this unlocks may still be on its way to the server: one more try.
        if (trace && !trace.withLetters) {
          await new Promise((r) => setTimeout(r, 1500));
          trace = await fetchSolveTrace(userId, puzzleKey);
        }
        if (!trace || !trace.withLetters) return;
        setReplay(withMine({ name: who?.name ?? "", color, seconds: trace.seconds, events: trace.events }));
        track("replay_watched", { racing: race.some((g) => g.userId === userId) });
      } catch {
        // A replay that can't load just doesn't open.
      }
    },
    [puzzleKey, puzzle, plus, openRacePitch, replayable, race, withMine],
  );

  // Autocheck off and the grid full but not right: a quiet notice over the
  // grid with the three ways out. Dismissed until the grid changes again.
  const [noticeDismissedFor, setNoticeDismissedFor] = useState<Record<string, unknown> | null>(null);
  const showWrongNotice =
    !autocheck && !isComplete && totalWhiteCells > 0 && filled === totalWhiteCells && noticeDismissedFor !== playerCells;
  const allCells = useMemo(
    () => (puzzle ? puzzle.cells.flat().filter((c) => c.solution !== null).map((c) => ({ row: c.row, col: c.col })) : []),
    [puzzle],
  );
  const handleCheckPuzzle = useCallback(() => {
    checkCells(allCells);
    track("puzzle_checked", { scope: "puzzle" });
    gridInputRef.current?.focus();
  }, [checkCells, allCells]);
  const handleCheckWord = useCallback(() => {
    const cells = [...highlightedCells].map((k) => {
      const [row, col] = k.split(",").map(Number);
      return { row, col };
    });
    checkCells(cells);
    track("puzzle_checked", { scope: "word" });
    gridInputRef.current?.focus();
  }, [checkCells, highlightedCells]);
  const handleRevealSquare = useCallback(() => {
    if (!selectedCell) return;
    revealCell(selectedCell.row, selectedCell.col);
    track("puzzle_checked", { scope: "reveal" });
    gridInputRef.current?.focus();
  }, [revealCell, selectedCell]);
  // Turning Autocheck back on judges what is already there, so the wrong
  // letters typed freely show up at once instead of silently blocking the finish.
  const handleAutocheckChange = useCallback(
    (on: boolean) => {
      setAutocheck(on);
      track("autocheck_toggled", { on });
      if (on && allCells.length) checkCells(allCells);
    },
    [setAutocheck, checkCells, allCells],
  );

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
      source: isDaily ? "daily" : fromNyt ? "nyt" : puzzle?.origin === "community" ? "community" : "other",
      mode: "solo",
      seconds: soloResult.finishSeconds,
      assisted: soloResult.assisted,
    }).then((outcome) => outcome && setServerOutcome(outcome));
  }, [soloResult, freshResult, accountId, puzzle, isDaily, fromNyt]);

  // The shared puzzle this is, where the site can link to it (Puzzle.ref):
  // any day's daily, or a community puzzle. Imports have none.
  const puzzleRef = useMemo<PuzzleRef | null>(() => puzzle?.ref ?? (dailySlot ? { day: todayKey(), slot: dailySlot } : null), [puzzle, dailySlot]);

  // A fresh finish's replay (replayCode.ts) on a linkable puzzle, filed under
  // a short share ID (replayShare.ts): previewed on the completion screen and
  // carried by the share link and friend invites, for every solver. No ID
  // (offline, say), no replay.
  const [replayId, setReplayId] = useState<string | null>(null);
  const replayFiledRef = useRef(false);
  useEffect(() => {
    setReplayId(null);
    replayFiledRef.current = false;
  }, [puzzleKey, attempt]);
  // A solve reopened later shares with the replay this device filed for it,
  // when the time it shows is that finish's.
  const reopenedSeconds = reopened ? soloResult?.finishSeconds : undefined;
  useEffect(() => {
    if (puzzleKey && reopenedSeconds !== undefined) setReplayId(rememberedReplay(puzzleKey, reopenedSeconds));
  }, [puzzleKey, reopenedSeconds]);
  // Racing a shared link's sender (ChallengeScreen): their puzzle, for the reply.
  const linkGhost = race.find((g) => g.link) ?? null;
  useEffect(() => {
    if (!soloResult || !freshResult || !(puzzleRef || linkGhost) || !puzzle || soloResult.assisted || replayFiledRef.current) return;
    replayFiledRef.current = true;
    const trace = recorder.take();
    const code = trace ? encodeReplay(puzzle, trace.events, soloResult.finishSeconds, trace.marks) : null;
    void (async () => {
      const id = code ? await createReplayShare(code) : null;
      if (id) {
        setReplayId(id);
        if (puzzleKey) rememberReplay(puzzleKey, id, soloResult.finishSeconds);
      }
      // Close the loop: the link's sender hears how this racer did (raceReplies.ts).
      if (linkGhost?.link) {
        await replyToRace({
          shareId: linkGhost.link.shareId,
          replyShareId: id,
          name: isRealPlayerName(game.displayName) ? game.displayName : t("common.defaultPlayerName"),
          ref: linkGhost.link.ref,
          seconds: soloResult.finishSeconds,
          toSeconds: linkGhost.seconds,
        });
      }
    })();
  }, [soloResult, freshResult, puzzleRef, linkGhost, puzzle, puzzleKey, recorder, game.displayName, t]);

  // File the finish's recording for others to race (race.ts): an account's
  // own first solve only, nothing revealed, recorded from the first letter.
  const traceFiledRef = useRef(false);
  useEffect(() => {
    if (!soloResult || !freshResult || !accountId || !puzzleKey || traceFiledRef.current) return;
    traceFiledRef.current = true;
    const trace = recorder.take();
    saveTrace(null);
    if (!trace || soloResult.assisted || solvedBeforeRef.current) return;
    void saveSolveTrace(puzzleKey, soloResult.finishSeconds, trace.events).catch(() => undefined);
  }, [soloResult, freshResult, accountId, puzzleKey, recorder]);

  const shownResult = useMemo(() => {
    if (!soloResult) return null;
    if (serverOutcome) {
      return {
        bestSeconds: serverOutcome.bestSeconds ?? soloResult.bestSeconds,
        isNewBest: serverOutcome.isNewBest,
        previousBest: serverOutcome.previousBest,
        streak: serverOutcome.streak.current,
        streakAdvanced: serverOutcome.streakAdvanced,
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
        streakAdvanced: undefined,
        nytStreak: effectiveStreak(history.summary.nytStreak, today),
      };
    }
    return {
      bestSeconds: soloResult.bestSeconds,
      isNewBest: soloResult.isNewBest,
      previousBest: soloResult.previousBest,
      streak: soloResult.streak.current,
      streakAdvanced: soloResult.streakAdvanced,
      nytStreak: null,
    };
  }, [soloResult, serverOutcome, freshResult, history.summary, puzzle]);

  // Guests explicitly sign each finish, even with a remembered name. Account
  // opt-outs stay private. The confirmation latches after a successful sign;
  // previews show a notice instead of offering to post.
  const [boardSignedAs, setBoardSignedAs] = useState<string | null>(null);
  const pendingDaily = dailySlot ? pendingResultFor(game.pendingDailyResult, todayKey(), dailySlot) : null;
  const handleSignBoard = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || !pendingDaily || pendingDaily.postingHold) return;
      setBoardSignedAs(trimmed);
      game.setDisplayName(trimmed);
      savePlayerName(trimmed);
      // Posts the parked finish (or renames a posted one); the board's own
      // row shows the signed name at once.
      if (pendingDaily) game.setPendingDailyResult(signDailyResult(pendingDaily, trimmed));
    },
    [game, pendingDaily],
  );
  const boardNotPosted = isDaily && !!user && !!soloResult && !boardPostsHere();
  const dailySign =
    isDaily && user && soloResult && !boardNotPosted && pendingDaily && !pendingDaily.postingHold && (boardSignedAs || !pendingDaily.posted || !isRealPlayerName(game.displayName))
      ? { signedAs: boardSignedAs, onSign: handleSignBoard, unposted: !pendingDaily?.posted }
      : undefined;

  // Report solo completion once (isComplete latches true once the grid fills).
  const completionReportedRef = useRef(false);
  useEffect(() => {
    if (!isComplete || completionReportedRef.current) return;
    completionReportedRef.current = true;
    if (reopened) return;
    track("puzzle_completed", {
      mode: "solo",
      origin: puzzle?.origin,
      size: puzzle ? `${puzzle.width}x${puzzle.height}` : undefined,
      cells: totalWhiteCells,
      duration_seconds: getElapsedSeconds(),
      autocheck: !usedFreeTyping,
      assisted,
    });
  }, [isComplete, reopened, puzzle, totalWhiteCells, getElapsedSeconds, usedFreeTyping, assisted]);

  // NYT-bookmarklet return loop: finishing an imported NYT puzzle rolls the
  // NYT streak (same-day repeats/reloads are no-ops) and the modal nudges
  // "same time tomorrow". Solo only needs the finish, not a server round-trip.
  const [nytStreak, setNytStreak] = useState<number | null>(null);
  useEffect(() => {
    if (!isComplete || reopened || !fromNyt || nytStreak !== null) return;
    setNytStreak(recordNytPlay().current);
  }, [isComplete, reopened, fromNyt, nytStreak]);

  const handleExit = useCallback(() => {
    pause();
    if (!checkpoint() || !rememberSoloLanding("menu")) { setSaveFailed(true); return; }
    navigate("/menu");
  }, [pause, checkpoint, navigate]);

  const saveBeforeLeave = useCallback(() => {
    inputAllowed.current = false;
    pause();
    return checkpoint();
  }, [pause, checkpoint]);
  const lifecycle = useRef({ handlePause, handleExit });
  lifecycle.current = { handlePause, handleExit };
  useEffect(() => watchSoloLifecycle(() => lifecycle.current.handlePause(), () => lifecycle.current.handleExit()), []);

  const handleBackToMenu = useCallback(() => {
    setCompletionModalDismissed(true);
    handleExit();
  }, [setCompletionModalDismissed, handleExit]);

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

  // The explicit way back to an empty grid (Andrew, 2026-11-10): a solved
  // puzzle stays solved until the solver asks, and confirms, to do it again.
  const confirm = useConfirm();
  const restartSolo = game.restartSolo;
  const handleSolveAgain = useCallback(async () => {
    const ok = await confirm({
      title: t("playing.solveAgainTitle"),
      body: t("playing.solveAgainBody"),
      confirmLabel: t("playing.solveAgainConfirm"),
    });
    if (!ok || !restartSolo()) return;
    restartTimer();
    recorder.reset();
    saveRace(null);
    setRace([]);
    setAttempt((n) => n + 1);
    track("solo_solve_again", { size: puzzle ? `${puzzle.width}x${puzzle.height}` : undefined });
    requestAnimationFrame(() => gridInputRef.current?.focus());
  }, [confirm, t, restartSolo, restartTimer, puzzle, recorder]);

  // "Up next" (audit §2, item 8): today's other dailies, then yesterday's.
  // A daily loads straight into this screen, the same path the menu's
  // "Play" takes.
  const nextUp = useNextUp(soloResult ? puzzleKey : null, isComplete);
  const handleNextUp = useCallback(
    async (item: NextUpItem) => {
      clearChallenge();
      if (item.kind === "archive") {
        // Yesterday's daily, fetched by day + slot like the archive screen does.
        track("mode_selected", { mode: "archive", slot: item.entry.slot, from: "completion" });
        const daily = await fetchDailyForDay(item.entry.day, item.entry.slot);
        if (!daily) return;
        if (await game.handleSoloPuzzleLoaded(daily.puzzle) === false) return;
        game.setSoloTheme(daily.theme || null);
        return;
      }
      track("mode_selected", { mode: "daily", slot: item.slot, from: "completion" });
      if (await game.handleSoloPuzzleLoaded(item.daily.puzzle) === false) return;
      game.setSoloTheme(item.daily.theme);
    },
    [game],
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
  if (!puzzle && game.restoringSolo) return null;
  if (!puzzle) {
    return <Navigate to="/menu" replace />;
  }

  const showCompletionModal = isComplete && !completionModalDismissed;

  return (
    <>
      {dataRouter && <SoloNavigationGuard saveBeforeLeave={saveBeforeLeave} />}
      <div inert={paused} aria-hidden={paused || undefined} className={paused ? "hidden" : undefined}>
      <GameLayout
        keyboard={<PuzzleKeyboard actions={guardedActions} disabled={isComplete || clueSheetOpen} />}
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
                {/* The gear needs header room a phone doesn't have: there the switch sits in the clue sheet. */}
                <SoloOptions autocheck={autocheck} onAutocheckChange={handleAutocheckChange} className="hidden md:block" />
                <button
                  onClick={isComplete ? handleExit : handlePause}
                  className={buttonClass("secondary", "md")}
                >
                  {!isComplete && <Pause className="size-4" aria-hidden="true" />}
                  {t(isComplete ? "soloPause.choose" : "soloPause.pause")}
                </button>
                <AccountControl placement="play" className="-mr-1.5" />
              </div>
            </div>
            {isComplete && (
              <SolvedStrip onSolveAgain={handleSolveAgain} />
            )}
            {racing && <RaceGhosts ghosts={race} frames={ghostFrames} totalCells={totalWhiteCells} />}
            {showRaceStarter && (
              <RaceStarter
                key={`${puzzleKey}:${raceIntent.join(",")}`}
                candidates={raceCandidates}
                plus={plus}
                preselect={raceIntent}
                onStart={startRace}
                onPitch={openRacePitch}
              />
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
              navigationActions={guardedActions}
              rejectedCell={rejectedCell}
              inputRef={gridInputRef}
              ghostTints={racing ? ghostTintMap : undefined}
            />
            {showWrongNotice && (
              <div
                role="status"
                data-testid="wrong-notice"
                className="absolute inset-x-2 bottom-2 z-10 rounded-2xl bg-surface/95 p-3 shadow-overlay ring-1 ring-line backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="pt-2 text-sm font-semibold text-ink">{t("autocheck.filledWrong", { count: wrong })}</p>
                  <button
                    type="button"
                    aria-label={t("autocheck.dismiss")}
                    onClick={() => setNoticeDismissedFor(playerCells)}
                    className="-m-1.5 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" onClick={handleCheckPuzzle} className={buttonClass("primary", "md")}>
                    {t("autocheck.checkPuzzle")}
                  </button>
                  <button type="button" onClick={handleCheckWord} className={buttonClass("secondary", "md")}>
                    {t("autocheck.checkWord")}
                  </button>
                  <button type="button" onClick={handleRevealSquare} className={buttonClass("secondary", "md")}>
                    {t("autocheck.revealSquare")}
                  </button>
                </div>
              </div>
            )}
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
              inputRef={gridInputRef}
              scoreboard={
                <>
                  <Scoreboard
                    score={autocheck ? score : filled}
                    totalCells={totalWhiteCells}
                    isComplete={isComplete}
                  />
                  <AutocheckSwitch autocheck={autocheck} onAutocheckChange={handleAutocheckChange} className="ring-1 ring-line" />
                  <HapticsSwitch className="ring-1 ring-line" />
                </>
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
              score={autocheck ? score : filled}
              totalCells={totalWhiteCells}
              isComplete={isComplete}
            />
          </div>
        }
      />
      </div>
      {paused && !account.sheetOpen && <SoloPause title={puzzle.title} seconds={getElapsedSeconds()} error={saveFailed || timerSaveFailed || !!game.soloSaveError}
        onResume={handleResume} onExit={handleExit} onRetry={checkpoint} />}
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
        assisted={assisted}
        streakCount={shownResult?.streak}
        streakAdvanced={shownResult?.streakAdvanced}
        nytHook={fromNyt ? { streak: shownResult?.nytStreak ?? nytStreak ?? 0 } : undefined}
        onViewLeaderboard={dailySlot ? handleViewLeaderboard : undefined}
        dailySlot={dailySlot ?? undefined}
        puzzleRef={puzzleRef ?? undefined}
        dailySign={dailySign}
        boardNotPosted={boardNotPosted}
        dailyPostingNotice={!boardNotPosted && dailyPostingNotice(pendingDaily) ? t(dailyPostingNotice(pendingDaily)!) : undefined}
        challengePuzzle={puzzle}
        playerCells={playerCells}
        wrongCells={shareWrongCells}
        challengerName={game.displayName}
        challengeOutcome={challengeOutcome}
        raceResults={race.length && soloResult ? raceResults(race, soloResult.finishSeconds) : undefined}
        replayId={replayId ?? undefined}
        shareBack={
          linkGhost?.link && replayId && soloResult
            ? {
                name: linkGhost.name,
                link: buildPuzzleLink(SHARE_URL, linkGhost.link.ref, { seconds: soloResult.finishSeconds, name: isRealPlayerName(game.displayName) ? game.displayName : undefined, replay: replayId }),
                ...compareToChallenge(linkGhost.seconds, soloResult.finishSeconds),
              }
            : undefined
        }
        replays={reopened ? undefined : replayable}
        onWatchReplay={(userId) => void watchReplay(userId)}
        nextUp={nextUp}
        onNextUp={(item) => void handleNextUp(item)}
        onRaceFresh={user ? handleRaceFresh : undefined}
        puzzleSize={`${puzzle.width}x${puzzle.height}`}
        onBackToMenu={handleBackToMenu}
        onSignIn={account.available && account.ready && !account.user ? handleSignIn : undefined}
      />
      {replay && <ReplayDialog puzzle={puzzle} solves={replay} onClose={() => setReplay(null)} />}
    </>
  );
}
