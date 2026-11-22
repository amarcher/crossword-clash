import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, PlayCircle } from "lucide-react";
import { CrosswordGrid } from "../components/CrosswordGrid";
import { CluePanel } from "../components/CluePanel";
import { CompletionModal } from "../components/CompletionModal";
import { FinishedBar } from "../components/FinishedBar";
import { GameLayout } from "../components/Layout/GameLayout";
import { MultiplayerScoreboard } from "../components/Scoreboard/MultiplayerScoreboard";
import { RoomReplayDialog } from "../components/Race/RoomReplayDialog";
import { AccountControl } from "../components/Account/AccountControl";
import { Button } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useTodaysDailySlot } from "../hooks/useDailyMini";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { track } from "../lib/analytics";
import { leaderboardPath } from "../lib/dailyLeaderboard";
import { resolvePuzzleRef } from "../lib/gameSettings";
import { countCluesPerPlayer, getCompletedClues, getCompletedCluesByPlayer } from "../lib/gridUtils";
import { createReplayShare } from "../lib/replayShare";
import { buildRoomReplay, roomReplayCode, roomReplayOrder } from "../lib/roomReplay";
import { fetchRoomResult, type RoomResult } from "../lib/roomResult";
import { rememberSoloLanding } from "../lib/soloSession";
import type { Puzzle, PuzzleClue } from "../types/puzzle";

const NO_CELLS = {};
const NOOP = () => {};

/**
 * A puzzle finished in a room, opened again (GameContext.reopenedRoom): the
 * room's final board in its players' colours, its standings, its replay and
 * its share, read from the room the server still holds (roomResult.ts). It
 * stands as the solved puzzle until "Play solo" clears it for an attempt of
 * one's own. A room that can no longer be read falls through to that attempt.
 */
export function RoomResultScreen({ puzzle }: { puzzle: Puzzle }) {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const game = useGame();
  const navigate = useTransitionNavigate();
  const dailySlot = useTodaysDailySlot(puzzle);
  // undefined: still reading.
  const [room, setRoom] = useState<RoomResult | null | undefined>(undefined);
  const [shareOpen, setShareOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [activeClue, setActiveClue] = useState<PuzzleClue | null>(null);
  const [replayId, setReplayId] = useState<string>();

  const userId = user?.id;
  const { restartSolo } = game;
  useEffect(() => {
    if (!userId) {
      // Nobody to look a room up for: the attempt of one's own.
      if (!loading) restartSolo();
      return;
    }
    let live = true;
    void fetchRoomResult(puzzle, userId).then((found) => {
      if (!live) return;
      // Nothing to show: the puzzle opens as it did before, on an attempt of one's own.
      if (!found) restartSolo();
      else {
        track("room_result_opened", { size: `${puzzle.width}x${puzzle.height}` });
        setRoom(found);
      }
    });
    return () => {
      live = false;
    };
  }, [puzzle, userId, loading, restartSolo]);

  const cells = room?.cells ?? NO_CELLS;
  const colors = useMemo(() => Object.fromEntries((room?.players ?? []).map((p) => [p.userId, p.color])), [room]);
  const completedClues = useMemo(() => getCompletedClues(puzzle, cells), [puzzle, cells]);
  const cluesByPlayer = useMemo(() => getCompletedCluesByPlayer(puzzle, cells), [puzzle, cells]);
  const clueCounts = useMemo(() => countCluesPerPlayer(cluesByPlayer), [cluesByPlayer]);
  const results = useMemo(
    () => (room?.players ?? []).map((p) => ({ userId: p.userId, displayName: p.displayName, color: p.color, cellsClaimed: p.score, cluesCompleted: clueCounts.get(p.userId) ?? 0 })),
    [room, clueCounts],
  );
  const replay = useMemo(() => (room ? buildRoomReplay(room.cells, room.startedAt) : null), [room]);
  // The same clip the room's own finish shared, filed again for this link.
  const replayCode = useMemo(() => (room && replay ? roomReplayCode(puzzle, replay, colors, userId) : null), [room, replay, puzzle, colors, userId]);
  useEffect(() => {
    if (!shareOpen || !replayCode || replayId) return;
    let live = true;
    void createReplayShare(replayCode).then((id) => live && id && setReplayId(id));
    return () => {
      live = false;
    };
  }, [shareOpen, replayCode, replayId]);
  const raceWho = useMemo(() => {
    if (!room || !replay || room.coop) return undefined;
    const names = roomReplayOrder(replay, userId).map((id) => room.players.find((p) => p.userId === id)?.displayName ?? "");
    return names.every(Boolean) ? names : undefined;
  }, [room, replay, userId]);

  const highlighted = useMemo(() => {
    const set = new Set<string>();
    if (activeClue) for (let i = 0; i < activeClue.length; i++) set.add(activeClue.direction === "across" ? `${activeClue.row},${activeClue.col + i}` : `${activeClue.row + i},${activeClue.col}`);
    return set;
  }, [activeClue]);

  const exit = useCallback(() => {
    rememberSoloLanding("menu");
    navigate("/menu");
  }, [navigate]);
  const viewBoard = useCallback(() => {
    if (dailySlot) navigate(leaderboardPath(dailySlot));
  }, [dailySlot, navigate]);
  const totalCells = useMemo(() => puzzle.cells.flat().filter((c) => c.solution !== null).length, [puzzle]);

  const side = room && (
    <div className="flex flex-col gap-3 md:h-full md:gap-4">
      <MultiplayerScoreboard players={room.players} totalCells={totalCells} isComplete clueCountsByPlayer={clueCounts} totalClues={puzzle.clues.length} />
      <div className="grid grid-cols-2 gap-2 [&>*:only-child]:col-span-2">
        {replay && (
          <Button variant="soft" onClick={() => { track("room_replay_opened", { placement: "result" }); setReplayOpen(true); }}>
            <PlayCircle className="size-4" aria-hidden="true" />
            {t("roomReplay.watch")}
          </Button>
        )}
        <Button variant="secondary" onClick={() => restartSolo()}>
          {t("menu.dailyPlaySolo")}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <CluePanel clues={puzzle.clues} activeClue={activeClue} onClueClick={setActiveClue} completedClues={completedClues} completedCluesByPlayer={cluesByPlayer} playerColorMap={colors} />
      </div>
    </div>
  );

  return (
    <>
      <GameLayout
        header={
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={exit}
              aria-label={t("completion.backToMenu")}
              className="-ml-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-soft hover:text-brand-700 active:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <ArrowLeft className="size-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-bold tracking-tight text-ink md:text-2xl">{puzzle.title}</h1>
              {puzzle.author && <p className="hidden truncate text-sm text-muted md:block">{t("playing.by", { author: puzzle.author })}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2 md:gap-4">
              {room && <FinishedBar seconds={room.seconds} onShare={() => setShareOpen(true)} onLeaderboard={dailySlot ? viewBoard : undefined} />}
              <AccountControl placement="play" className="-mr-1.5" />
            </div>
          </div>
        }
        grid={
          <div aria-busy={room === undefined}>
            <CrosswordGrid puzzle={puzzle} playerCells={cells} selectedCell={null} highlightedCells={highlighted} onCellClick={NOOP} playerColorMap={colors} completedClues={completedClues} interactive={false} />
          </div>
        }
        clues={side ?? <div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-surface-sunken motion-reduce:animate-none" />}
      />
      {room && (
        <CompletionModal
          open={shareOpen}
          totalCells={totalCells}
          totalClues={puzzle.clues.length}
          players={results}
          currentUserId={userId}
          raceSeconds={room.seconds ?? undefined}
          coop={room.coop}
          challengePuzzle={puzzle}
          playerCells={room.cells}
          playerColors={colors}
          challengerName={game.displayName}
          puzzleSize={`${puzzle.width}x${puzzle.height}`}
          dailySlot={dailySlot ?? undefined}
          puzzleRef={resolvePuzzleRef(room.settings) ?? puzzle.ref}
          onViewLeaderboard={dailySlot ? viewBoard : undefined}
          onBackToMenu={exit}
          onClose={() => setShareOpen(false)}
          replayId={replayId}
          replayPending={!!replayCode && !replayId}
          raceWho={raceWho}
          onWatchRoomReplay={replay ? () => setReplayOpen(true) : undefined}
        />
      )}
      {room && replay && replayOpen && <RoomReplayDialog puzzle={puzzle} replay={replay} players={results} playerColorMap={colors} onClose={() => setReplayOpen(false)} />}
    </>
  );
}
