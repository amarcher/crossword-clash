import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, UNSAFE_DataRouterContext } from "react-router";
import { useTranslation } from "react-i18next";
import { CrosswordGrid, useGridNavigation } from "../components/CrosswordGrid";
import { ArrowLeft, Flag, Pause, X } from "lucide-react";
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
import { playedBefore } from "../lib/solvedPuzzles";
import { AccountControl } from "../components/Account/AccountControl";
import { AutocheckSwitch, HapticsSwitch, SoloOptions } from "../components/SoloOptions";
import { useSoloSettings } from "../lib/soloSettings";
import { useGame } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useAuth } from "../contexts/AuthContext";
import { useRaceName } from "../hooks/useRaceName";
import { useAccountContext } from "../contexts/AccountContext";

import { dayKey, effectiveStreak, formatDuration, puzzleIdentity, recordNytPlay, shiftDayKey } from "../lib/soloStats";
import { repairAccountStreak, repairLocalStreak, repairRow } from "../lib/streakRepair";
import { emitToast } from "../lib/toastBus";
import { addHistoryRows, getSolveHistoryState, recordSolve, type SolveOutcome } from "../lib/solveHistory";
import { useSolveHistory } from "../hooks/useSolveHistory";
import { useTodaysDailySlot } from "../hooks/useDailyMini";
import { useNextUp } from "../hooks/useNextUp";
import type { NextUpItem } from "../lib/nextUp";
import { fetchDailyForDay } from "../lib/dailyFeed";
import { getProgress, isStarted, saveAttempt } from "../lib/soloProgress";
import { consumeSoloChosen, consumeSoloStart, peekSoloChosen, peekSoloStart, rememberSoloLanding } from "../lib/soloSession";
import { watchSoloLifecycle } from "../lib/soloLifecycle";
import { SoloNavigationGuard } from "../components/SoloNavigationGuard";
import { SoloPause } from "../components/SoloPause";
import { SoloStartGate } from "../components/SoloStartGate";
import { useFriends } from "../contexts/FriendsContext";
import { useFriendSolves } from "../hooks/useFriendSolves";
import { pickerPath } from "./PuzzlePickerScreen";
import { usePlayInsights } from "../hooks/usePlayInsights";
import { boardPostsHere, leaderboardPath, prepareDailyResult, pendingResultFor, dailyPostingNotice, signDailyResult, todayKey, type BoardSlot, type PendingDailyResult } from "../lib/dailyLeaderboard";
import { isRealPlayerName, savePlayerName } from "../lib/playerName";
import { loadChallenge, clearChallenge, compareToChallenge } from "../lib/challenge";
import { useSoloTimer } from "../hooks/useSoloTimer";
import { uploadPuzzle, createGame } from "../lib/puzzleService";
import { supabase } from "../lib/supabaseClient";
import { track } from "../lib/analytics";
import type { PuzzleClue, PuzzleRef } from "../types/puzzle";
import { firstEmptyCell, getFilledClues } from "../lib/gridUtils";
import { useGhosts, useRaceCandidateList, useSolveRecorder } from "../hooks/useRace";
import { clearTrace, fetchOwnSolveTrace, fetchSolveTrace, GHOST_COLORS, loadRace, raceResults, saveRace, saveSolveTrace, peekRaceIntent, takeRaceIntent, type Ghost } from "../lib/race";
import { RaceGhosts } from "../components/Race/RaceGhosts";
import { ReplayDialog, type ReplaySolve } from "../components/Race/ReplayDialog";
import { FriendRaceDialog } from "../components/Race/FriendRaceDialog";
import { fetchFriendRace, raceSolves, type RaceSolve } from "../lib/friendRace";
import { encodeReplay } from "../lib/replayCode";
import { createReplayShare, fetchReplayShare, letteredReplay, rememberReplay, rememberedReplay } from "../lib/replayShare";
import { replyToRace } from "../lib/raceReplies";
import { buildPuzzleLink } from "../lib/dailyChallenge";
import { SHARE_URL } from "../lib/resultCard";
import { useBoardJoin } from "../hooks/useBoardJoin";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { RoomResultScreen } from "./RoomResultScreen";

/** The viewer's own solve beside someone else's in a race replay: the brand blue. */
const MY_REPLAY_COLOR = "#3a6bf0";

export function SoloPlayScreen() {
  const { t, i18n } = useTranslation();
  const ownName = useRaceName();
  const navigate = useTransitionNavigate();
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const game = useGame();
  const mp = useMultiplayerContext();
  const { user } = useAuth();
  const account = useAccountContext();
  const friends = useFriends();

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
  const openedSolved = !!key && game.reopenedSolved?.key === key;
  // Every way onto an unfinished grid passes the start card (SoloStartGate):
  // the clock waits for it, so no time passes before the grid can be read.
  // A puzzle with nothing on it yet is asked how to play first; an attempt
  // resumed (Resume on the menu, the Paused card, "Clear & redo") gets the
  // count alone (Andrew, 2026-11-19: Resume dropped straight onto a running
  // clock). The gate is up on the very first frame (the same test
  // takeSoloStart makes when the clock asks, an effect later): the grid is
  // never shown unblurred before its card.
  // "fresh": asked how to play. "resume": the count alone. "pause": the same, reached from the Paused card.
  const [startGate, setStartGate] = useState<"fresh" | "resume" | "pause" | null>(() => {
    const attempt = key ? getProgress(key) : null;
    if (!key || !attempt) return null;
    if (!isStarted(attempt)) return "fresh";
    return peekSoloStart(key) ? "resume" : null;
  });
  const [soloChosen, setSoloChosen] = useState(peekSoloChosen);
  const takeSoloStart = useCallback((k: string) => {
    const start = consumeSoloStart(k);
    const attempt = getProgress(k);
    if (!attempt) return start;
    // However an untouched puzzle is reached (Play, Back from a room's name screen, a reload),
    // it opens on the start card, never on "Paused" at 0:00.
    if (!isStarted(attempt)) {
      setSoloChosen(consumeSoloChosen());
      setStartGate("fresh");
    } else if (start) setStartGate("resume");
    // Not asked for (a reload, browser Forward): "Paused", whose Resume counts in.
    return false;
  }, []);
  const { getElapsedSeconds, getElapsedMs, running: timerRunning, idlePaused, result: soloResult, fresh: freshResult, pause, resume, save: saveTimer, saveFailed: timerSaveFailed, restart: restartTimer } = useSoloTimer(
    puzzle,
    isComplete,
    assisted,
    takeSoloStart,
    game.reopenedSolved,
  );
  // A finished session restored after the app was closed (the tab reloaded on
  // the play screen) is the same look at a solve already had: its finish is
  // not fresh, and nothing opened it from the menu. Without this it was
  // parked for the board again and shared with no replay.
  const reopened = openedSolved || (!!soloResult && !freshResult);
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
  // The board a finish here belongs on: a daily's, or the bonus board for
  // today's bonus (bonus.ts; a bonus played on a later day ranks nowhere).
  const boardSlot: BoardSlot | null = dailySlot ?? (puzzle?.origin === "bonus" && puzzle.bonusDay === todayKey() ? "bonus" : null);
  // The board the finished grid links to: that one, or for a past daily or
  // bonus (from the archive) that day's final board, which slots the
  // viewer's time in where it would have placed.
  const boardView = useMemo((): { slot: BoardSlot; day: string | null } | null => {
    if (boardSlot) return { slot: boardSlot, day: null };
    const today = todayKey();
    if (puzzle?.ref && "day" in puzzle.ref && puzzle.ref.day < today) return { slot: puzzle.ref.slot, day: puzzle.ref.day };
    if (puzzle?.origin === "bonus" && puzzle.bonusDay && puzzle.bonusDay < today) return { slot: "bonus", day: puzzle.bonusDay };
    return null;
  }, [boardSlot, puzzle]);
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
    if (reopened || !boardSlot || !user) return;
    // An account's profile arrives after a cold start. Parked before it, a
    // restored finish went under the default name and the dialog asked a
    // signed-in solver, already on the board, to add a name.
    if (!user.is_anonymous && !account.profileReady) return;
    dailySubmittedRef.current = true;
    // A second solve of a puzzle already solved is made knowing the answers:
    // it may set a personal best, it never goes on the day's board.
    if (freshResult && solvedBeforeRef.current) return;
    // A finish that used Reveal posts no time: the board is for solves.
    if (soloResult.assisted) return;
    const displayName = isRealPlayerName(game.displayName) ? game.displayName : account.profile?.username ?? game.displayName;
    const entry = { userId: user.id, displayName, mode: "solo" as const, seconds: Math.max(0, Math.floor(soloResult.finishSeconds)), autocheck: !usedFreeTyping };
    const day = todayKey();
    const pending: PendingDailyResult = { day, slot: boardSlot, entry, gameId: null, posted: false, postingHold: "checking", settled: Promise.resolve() };
    pending.settled = prepareDailyResult(day, boardSlot, entry, user).then(result => {
      setPendingDailyResult(current => current === pending ? result : current);
      return result.settled;
    });
    setPendingDailyResult(pending);
  }, [soloResult, freshResult, reopened, boardSlot, user, account.profileReady, account.profile?.username, game.displayName, game.gameId, setPendingDailyResult, usedFreeTyping]);

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
    // Solved before in any way, a room included (playedBefore).
    solvedBeforeRef.current = !!puzzleKey && playedBefore(puzzleKey);
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
  // Known on the first frame, as the start card is: it decides the card's first step.
  const [intent, setIntent] = useState(() => ({ key: puzzleKey, ids: puzzleKey ? peekRaceIntent(puzzleKey) : [] }));
  useEffect(() => {
    const taken = puzzleKey ? takeRaceIntent(puzzleKey) : [];
    setIntent((now) => (now.key === puzzleKey ? now : { key: puzzleKey, ids: taken }));
  }, [puzzleKey]);
  const raceIntent = intent.ids;
  const { rows: raceCandidates, ready: raceCandidatesReady } = useRaceCandidateList(puzzleKey, !reopened);
  const racing = race.length > 0 && !isComplete;
  const { frames: ghostFrames, tints: ghostTintMap } = useGhosts(race, getElapsedMs, timerRunning && !isComplete, width);
  // "Race friends live" on the start card: the room is made at once under the account's
  // username and the lobby is where friends are invited (Andrew, 2026-11-19). A player with
  // no username yet is asked for a name first, as before (the host name screen).
  const username = account.profile?.username;
  const openLiveRoom = useCallback(async () => {
    if (!puzzle || !user) return;
    track("mode_selected", { mode: "play-live" });
    rememberSoloLanding("menu");
    if (username) {
      const puzzleId = await uploadPuzzle(puzzle);
      const room = puzzleId ? await createGame(puzzleId, user.id, { multiplayer: true, displayName: username }) : null;
      if (room) {
        game.setDisplayName(username);
        savePlayerName(username);
        game.loadPuzzle(puzzle);
        game.setGameId(room.gameId);
        game.setIsMultiplayer(true);
        game.setCompletionModalDismissed(false);
        game.setUrlPuzzle(null);
        setStartGate(null);
        navigate(`/lobby/${room.gameId}`);
        return;
      }
    }
    setStartGate(null);
    game.setUrlPuzzle(puzzle);
    navigate("/host-game/name");
  }, [puzzle, user, username, game, navigate]);
  // Friends who have not solved this puzzle, for that row's line.
  const friendSolves = useFriendSolves(startGate === "fresh" ? puzzleKey : null);
  const liveFriends = useMemo(
    () => (friends.active ? friends.friendships.friends.filter((f) => !friendSolves[f.userId] && !raceCandidates.some((c) => c.userId === f.userId)).map((f) => f.username) : []),
    [friends.active, friends.friendships.friends, friendSolves, raceCandidates],
  );
  // The picked solves, loaded and set beside the grid; the clock is the caller's to start.
  const loadGhosts = useCallback(
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
        recorder.reset();
        track("race_started", { ghosts: ghosts.length, friends: ghosts.filter((g) => raceCandidates.find((c) => c.userId === g.userId)?.friend).length });
        return true;
      } catch {
        return false;
      }
    },
    [puzzleKey, raceCandidates, recorder],
  );

  // Watching a recorded solve, letters and all, once this one is finished.
  const [replay, setReplay] = useState<ReplaySolve[] | null>(null);
  // Watching someone just raced: their solve beside this one, on one clock (both sides have finished).
  const withMine = useCallback(
    (theirs: ReplaySolve): ReplaySolve[] => {
      const mine = soloResult ? recorder.take() : null;
      return mine && soloResult ? [{ name: ownName, color: MY_REPLAY_COLOR, seconds: soloResult.finishSeconds, events: mine.events }, theirs] : [theirs];
    },
    [soloResult, recorder, ownName],
  );
  const replayable = useMemo(() => {
    const seen = new Set<string>();
    const out: { userId: string; name: string }[] = [];
    const add = (userId: string, name: string) => {
      if (seen.has(userId)) return;
      seen.add(userId);
      out.push({ userId, name });
    };
    // Only someone just raced. Other solvers' replays are on the leaderboard's rows, and
    // friends' are The race: two kinds of Watch here read as one feature with two rules
    // (Andrew, 2026-11-16).
    for (const g of race) add(g.userId, g.name);
    return out.slice(0, 3);
  }, [race]);
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
    [puzzleKey, puzzle, replayable, race, withMine],
  );

  // The race (friendRace.ts): this solve and every friend's recorded one on a
  // single clock, free. One button on the finish dialog; friends it covers
  // are not also listed one by one.
  const racingFriends = useMemo(() => raceCandidates.filter((c) => c.friend), [raceCandidates]);
  const [friendRace, setFriendRace] = useState<{ solves: RaceSolve[]; letters: boolean } | null>(null);
  const watchFriendRace = useCallback(async () => {
    if (!puzzleKey || !user) return;
    try {
      let found = await fetchFriendRace(puzzleKey);
      // The finish that unlocks the letters may still be on its way to the server: one more try.
      if (found.friends.length > 0 && !found.withLetters) {
        await new Promise((r) => setTimeout(r, 1500));
        found = await fetchFriendRace(puzzleKey);
      }
      if (found.friends.length === 0) return;
      const mine = soloResult ? recorder.take() : null;
      const own = mine && soloResult && !mine.partial ? { seconds: soloResult.finishSeconds, events: mine.events } : await fetchOwnSolveTrace(user.id, puzzleKey).catch(() => null);
      const solves = raceSolves(found, own ? { id: user.id, name: ownName, ...own } : null);
      setFriendRace({ solves, letters: found.withLetters });
      track("friend_race_opened", { placement: "completion", racers: solves.length, own: !!own });
    } catch {
      // A race that can't load just doesn't open.
    }
  }, [puzzleKey, user, soloResult, recorder, ownName]);
  const friendIds = useMemo(() => new Set(racingFriends.map((c) => c.userId)), [racingFriends]);
  const listedReplays = useMemo(() => (racingFriends.length > 0 ? replayable.filter((r) => !friendIds.has(r.userId)) : replayable), [racingFriends, replayable, friendIds]);

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
  // The account's write of this finish is over (whatever came of it): a streak repair goes after it.
  const [historySettled, setHistorySettled] = useState(false);
  const historyRecordedRef = useRef(false);
  useEffect(() => {
    if (!soloResult || !freshResult || !accountId || !puzzle || historyRecordedRef.current) return;
    historyRecordedRef.current = true;
    void recordSolve(accountId, {
      puzzleKey: puzzleIdentity(puzzle),
      title: puzzle.title,
      source: isDaily ? "daily" : fromNyt ? "nyt" : puzzle?.origin === "community" ? "community" : puzzle?.origin === "bonus" ? "bonus" : "other",
      mode: "solo",
      seconds: soloResult.finishSeconds,
      assisted: soloResult.assisted,
    })
      .then((outcome) => outcome && setServerOutcome(outcome))
      .finally(() => setHistorySettled(true));
  }, [soloResult, freshResult, accountId, puzzle, isDaily, fromNyt]);
  useEffect(() => {
    if (soloResult && freshResult && puzzle?.origin === "bonus") track("bonus_completed", { seconds: soloResult.finishSeconds, assisted: soloResult.assisted });
  }, [soloResult, freshResult, puzzle]);

  // Streak repair (streakRepair.ts; Plus): yesterday's daily, solved today
  // after a single missed day, makes yesterday count again. The account's
  // history gets the server's marker row; this device's stats are repaired
  // too, so a signed-out Plus session (an app purchase) works the same way.
  const [repairedStreak, setRepairedStreak] = useState<number | null>(null);
  const repairTriedRef = useRef(false);
  useEffect(() => {
    setRepairedStreak(null);
    repairTriedRef.current = false;
  }, [puzzleKey, attempt]);
  useEffect(() => {
    if (!soloResult || !freshResult || soloResult.assisted || !account.plus || !puzzle || repairTriedRef.current) return;
    if (accountId && !historySettled) return;
    const ref = puzzle.ref;
    const today = dayKey(new Date());
    if (!ref || !("day" in ref) || ref.day !== shiftDayKey(today, -1)) return;
    repairTriedRef.current = true;
    void (async () => {
      const local = repairLocalStreak();
      let streak = local?.current ?? null;
      if (accountId && serverOutcome) {
        try {
          if (await repairAccountStreak(ref.day, puzzleIdentity(puzzle), today)) {
            addHistoryRows(accountId, [repairRow(ref.day, puzzleIdentity(puzzle), new Date().toISOString())]);
            const summary = getSolveHistoryState()?.summary;
            if (summary) streak = effectiveStreak(summary.streak, today);
          } else streak = null;
        } catch {
          streak = null;
        }
      }
      if (streak === null) return;
      setRepairedStreak(streak);
      const weekday = new Date(`${ref.day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "long" });
      emitToast({ message: t("streakRepair.done", { day: weekday }) });
    })();
  }, [soloResult, freshResult, account.plus, puzzle, accountId, historySettled, serverOutcome, t, i18n.language]);

  // The shared puzzle this is, where the site can link to it (Puzzle.ref):
  // any day's daily, a community puzzle, or a Daily Plus by its day (the
  // link plays the solve and offers the puzzle, never carries it). Imports have none.
  const puzzleRef = useMemo<PuzzleRef | null>(
    () => puzzle?.ref ?? (puzzle?.origin === "bonus" && puzzle.bonusDay ? { bonusDay: puzzle.bonusDay } : dailySlot ? { day: todayKey(), slot: dailySlot } : null),
    [puzzle, dailySlot],
  );

  // A fresh finish's replay (replayCode.ts) on a linkable puzzle, filed under
  // a short share ID (replayShare.ts): previewed on the completion screen and
  // carried by the share link and friend invites, for every solver. No ID
  // (offline, say), no replay.
  const [replayId, setReplayId] = useState<string | null>(null);
  const replayFiledRef = useRef(false);
  // Filing has ended, with or without an ID: until then the completion screen holds the clip's place.
  const [replaySettled, setReplaySettled] = useState(false);
  useEffect(() => {
    setReplayId(null);
    setReplaySettled(false);
    replayFiledRef.current = false;
  }, [puzzleKey, attempt]);
  // A solve reopened later shares with the replay this device filed for it,
  // when the time it shows is that finish's.
  const reopenedSeconds = reopened ? soloResult?.finishSeconds : undefined;
  useEffect(() => {
    if (!puzzleKey || reopenedSeconds === undefined) return;
    const remembered = rememberedReplay(puzzleKey, reopenedSeconds);
    setReplayId(remembered);
    // Solved on another device, or before a reinstall: this one never filed
    // the replay, and the share fell back to the squares alone (Andrew,
    // 2026-11-16). The account's kept recording of that same finish makes it
    // again; it has no refusals or clue changes, only the letters going in.
    if (remembered || !accountId || !puzzle || !puzzleRef) return;
    let live = true;
    void (async () => {
      try {
        const kept = await fetchOwnSolveTrace(accountId, puzzleKey);
        if (!live || !kept || kept.events.length === 0 || kept.seconds !== Math.floor(reopenedSeconds)) return;
        const code = encodeReplay(puzzle, kept.events, kept.seconds);
        const id = code ? await createReplayShare(code) : null;
        if (!id) return;
        rememberReplay(puzzleKey, id, kept.seconds);
        if (live) setReplayId(id);
      } catch {
        // Best-effort: the share still goes out with its squares.
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per reopened finish; the puzzle object is that finish's
  }, [puzzleKey, reopenedSeconds, accountId]);
  // Racing a shared link's sender (ChallengeScreen): their puzzle, for the reply.
  const linkGhost = race.find((g) => g.link) ?? null;
  useEffect(() => {
    if (!soloResult || !freshResult || !(puzzleRef || linkGhost) || !puzzle || soloResult.assisted || replayFiledRef.current) return;
    replayFiledRef.current = true;
    const trace = recorder.take();
    const code = trace ? encodeReplay(puzzle, trace.events, soloResult.finishSeconds, trace.marks) : null;
    void (async () => {
      const id = code ? await createReplayShare(code).catch(() => null) : null;
      setReplaySettled(true);
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
    clearTrace(puzzleKey);
    if (!trace || soloResult.assisted || solvedBeforeRef.current) return;
    void saveSolveTrace(puzzleKey, soloResult.finishSeconds, trace.events).catch(() => undefined);
  }, [soloResult, freshResult, accountId, puzzleKey, recorder]);

  const baseResult = useMemo(() => {
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
  const shownResult = useMemo(
    () => (baseResult && repairedStreak !== null ? { ...baseResult, streak: repairedStreak, streakAdvanced: true } : baseResult),
    [baseResult, repairedStreak],
  );

  // Guests explicitly sign each finish, even with a remembered name. Account
  // opt-outs stay private. The confirmation latches after a successful sign;
  // previews show a notice instead of offering to post.
  const [boardSignedAs, setBoardSignedAs] = useState<string | null>(null);
  const pendingDaily = boardSlot ? pendingResultFor(game.pendingDailyResult, todayKey(), boardSlot) : null;
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
  const boardNotPosted = !!boardSlot && !!user && !!soloResult && !boardPostsHere();
  // "Checking…" usually lasts a moment: shown at once it added a line to the finish dialog and
  // took it away again. It is said only once the check has run long; the other notices at once.
  const heldNotice = boardNotPosted ? null : dailyPostingNotice(pendingDaily);
  const checking = pendingDaily?.postingHold === "checking";
  const [checkingLong, setCheckingLong] = useState(false);
  useEffect(() => {
    if (!checking) { setCheckingLong(false); return; }
    const timer = window.setTimeout(() => setCheckingLong(true), 1500);
    return () => window.clearTimeout(timer);
  }, [checking]);
  const postingNotice = checking && !checkingLong ? null : heldNotice;
  // A player with no account is offered one, and an account that hides its solves is offered the
  // choice of who may watch: either way the finish then posts (useBoardJoin).
  const boardJoin = useBoardJoin(boardNotPosted || !soloResult ? null : pendingDaily);
  const dailySign =
    boardSlot && user && !user.is_anonymous && soloResult && !boardNotPosted && pendingDaily && !pendingDaily.postingHold && (boardSignedAs || !pendingDaily.posted || !isRealPlayerName(game.displayName))
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
    if (!boardView) return;
    setCompletionModalDismissed(true);
    navigate(leaderboardPath(boardView.slot, boardView.day));
  }, [boardView, setCompletionModalDismissed, navigate]);

  const handleSignIn = useCallback(() => {
    setCompletionModalDismissed(true);
    account.openAccount({ returnTo: "/menu", placement: "completion" });
  }, [setCompletionModalDismissed, account]);

  const handleSeeStats = useCallback(() => {
    setCompletionModalDismissed(true);
    track("stats_opened", { from: "completion" });
    navigate("/stats");
  }, [setCompletionModalDismissed, navigate]);

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
    // The emptied grid starts as every grid does: behind the count, the clock at zero until it ends.
    pause();
    setStartGate("resume");
    recorder.reset();
    saveRace(null);
    setRace([]);
    setAttempt((n) => n + 1);
    track("solo_solve_again", { size: puzzle ? `${puzzle.width}x${puzzle.height}` : undefined });
    requestAnimationFrame(() => gridInputRef.current?.focus());
  }, [confirm, t, restartSolo, restartTimer, pause, puzzle, recorder]);

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
      {/* Behind the start countdown the grid stays drawn, blurred past reading. The blur is on the grid itself:
          a route cross-fade's snapshot of the new page leaves out a backdrop filter, which showed the grid sharp.
          A filter makes this box what the app's fixed layout measures against, so it fills the screen itself. */}
      <div inert={paused} aria-hidden={paused || undefined} className={startGate ? (isComplete ? undefined : "fixed inset-0 overflow-hidden blur-lg") : paused ? "hidden" : undefined} data-testid="solo-board">
      <GameLayout
        keyboard={<PuzzleKeyboard actions={guardedActions} disabled={isComplete || clueSheetOpen} />}
        header={
          <>
            <div className="flex items-center justify-between gap-2">
              {/* The way out is a back arrow on the left, where every page's bar has it (Andrew, 2026-11-20). Mid-solve it saves and leaves in one press; Pause, on the right, stops the clock and stays. */}
              <button
                type="button"
                onClick={handleExit}
                aria-label={t("completion.backToMenu")}
                className="-ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:text-brand-700 active:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <ArrowLeft className="size-5" aria-hidden="true" />
              </button>
              <div className="min-w-0 flex-1">
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
                    onLeaderboard={boardView ? handleViewLeaderboard : undefined}
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
                {!isComplete && (
                  <button onClick={handlePause} className={buttonClass("secondary", "md", "max-sm:w-11 max-sm:px-0")}>
                    <Pause className="size-4" aria-hidden="true" />
                    {/* A phone's header gives the word's room to the puzzle's title; the two bars say it. */}
                    <span className="max-sm:sr-only">{t("soloPause.pause")}</span>
                  </button>
                )}
                <AccountControl placement="play" className="-mr-1.5" />
              </div>
            </div>
            {isComplete && (
              <SolvedStrip onSolveAgain={handleSolveAgain} />
            )}
            {racing && <RaceGhosts ghosts={race} frames={ghostFrames} totalCells={totalWhiteCells} />}
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
          <div className="flex flex-col gap-3 md:gap-4 md:h-full">
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
      {startGate && !isComplete && (
        <SoloStartGate
          title={puzzle.title}
          detail={t("menu.dailyMeta", { width: puzzle.width, height: puzzle.height, count: puzzle.clues.length })}
          answered={startGate !== "fresh" || soloChosen}
          race={startGate === "fresh" ? { ready: raceCandidatesReady, candidates: raceCandidates, preselect: raceIntent, onPick: loadGhosts } : undefined}
          live={startGate === "fresh" && supabase && user ? { names: liveFriends, onChoose: openLiveRoom } : undefined}
          onStart={() => { setStartGate(null); handleResume(); }}
          onBack={() => {
            setStartGate(null);
            // From the Paused card, back to it.
            if (startGate === "pause") return;
            rememberSoloLanding("menu");
            // Back to wherever Play was pressed; a puzzle opened with no page behind it goes to the menu.
            if (window.history.state?.idx > 0) window.history.back();
            else navigate("/menu");
          }}
        />
      )}
      {paused && !startGate && !account.sheetOpen && <SoloPause title={puzzle.title} seconds={getElapsedSeconds()} error={saveFailed || timerSaveFailed || !!game.soloSaveError} idle={idlePaused}
        onResume={() => setStartGate("pause")} onExit={handleExit} onRetry={checkpoint} />}
      <CompletionModal
        // The result follows the last letter by a frame; opened without it, the dialog drew once with no time, streak or clip.
        open={showCompletionModal && (!!soloResult || !puzzleKey)}
        totalCells={totalWhiteCells}
        totalClues={puzzle.clues.length}
        soloScore={score}
        finishSeconds={soloResult?.finishSeconds}
        bestSeconds={shownResult?.bestSeconds}
        isNewBest={shownResult?.isNewBest}
        previousBest={shownResult?.previousBest}
        assisted={assisted}
        streakCount={shownResult?.streak}
        nytHook={fromNyt ? { streak: shownResult?.nytStreak ?? nytStreak ?? 0 } : undefined}
        onViewLeaderboard={boardView ? handleViewLeaderboard : undefined}
        dailySlot={dailySlot ?? undefined}
        puzzleRef={puzzleRef ?? undefined}
        dailySign={dailySign}
        boardNotPosted={boardNotPosted}
        boardJoin={boardJoin ?? undefined}
        dailyPostingNotice={postingNotice ? t(postingNotice) : undefined}
        challengePuzzle={puzzle}
        playerCells={playerCells}
        wrongCells={shareWrongCells}
        challengerName={game.displayName}
        challengeOutcome={challengeOutcome}
        raceResults={race.length && soloResult ? raceResults(race, soloResult.finishSeconds) : undefined}
        replayId={replayId ?? undefined}
        replayPending={!!soloResult && freshResult && !!(puzzleRef || linkGhost) && !soloResult.assisted && !replaySettled}
        shareBack={
          linkGhost?.link && replayId && soloResult
            ? {
                name: linkGhost.name,
                link: buildPuzzleLink(SHARE_URL, linkGhost.link.ref, { seconds: soloResult.finishSeconds, name: isRealPlayerName(game.displayName) ? game.displayName : undefined, replay: replayId }),
                ...compareToChallenge(linkGhost.seconds, soloResult.finishSeconds),
              }
            : undefined
        }
        replays={reopened ? undefined : listedReplays}
        onWatchReplay={(userId) => void watchReplay(userId)}
        friendRace={!reopened && !assisted && racingFriends.length > 0 ? { count: racingFriends.length, name: racingFriends[0].username } : undefined}
        onWatchFriendRace={() => void watchFriendRace()}
        nextUp={nextUp}
        onNextUp={(item) => void handleNextUp(item)}
        onRaceFresh={user ? handleRaceFresh : undefined}
        puzzleSize={`${puzzle.width}x${puzzle.height}`}
        onBackToMenu={handleBackToMenu}
        onClose={() => setCompletionModalDismissed(true)}
        onSignIn={account.available && account.ready && !account.user ? handleSignIn : undefined}
        onSeeStats={account.available && account.user ? handleSeeStats : undefined}
      />
      {replay && <ReplayDialog puzzle={puzzle} solves={replay} onClose={() => setReplay(null)} />}
      {friendRace && <FriendRaceDialog puzzle={puzzle} solves={friendRace.solves} letters={friendRace.letters} shareRef={puzzleRef} onClose={() => setFriendRace(null)} />}
    </>
  );
}

/** `/solo/play`: a puzzle finished in a room and never solved alone opens on that room's result; everything else is the solo screen. */
export function SoloPlayRoute() {
  const { puzzle, reopenedRoom } = useGame();
  if (puzzle && reopenedRoom && reopenedRoom.key === puzzleIdentity(puzzle)) return <RoomResultScreen puzzle={puzzle} />;
  return <SoloPlayScreen />;
}
