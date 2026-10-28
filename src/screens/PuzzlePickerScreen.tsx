import { useCallback, useMemo, useState } from "react";
import { displayTheme } from "../lib/dailyFeed";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, Loader2 } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, MiniGridThumb } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame, STORAGE_KEY } from "../contexts/GameContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useBestTimes } from "../hooks/useSolveHistory";
import { useTodaysDailies } from "../hooks/useNextUp";
import { unsolvedDailies } from "../lib/nextUp";
import { createNextGame, uploadPuzzle } from "../lib/puzzleService";
import { clearMpSession, saveMpSession } from "../lib/sessionPersistence";
import { clearSoloTimer, puzzleIdentity } from "../lib/soloStats";
import { clearChallenge } from "../lib/challenge";
import { tStatic } from "../i18n/i18n";
import { track } from "../lib/analytics";
import type { DailySlot } from "../lib/dailyFeed";
import type { Puzzle } from "../types/puzzle";

/** What picking a puzzle means: host it fresh (name → lobby), or make it the room's next game. */
export type PickerIntent = "race" | "next";

const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const satisfies Record<DailySlot, string>;

export function pickerPath(intent: PickerIntent): string {
  return `/pick-puzzle?intent=${intent}`;
}

/**
 * The fresh-puzzle picker (navigation audit §2): today's dailies the solver
 * hasn't finished. Reached from a finish, so it never offers the puzzle just
 * solved and never sends anyone to the file importer.
 *
 * - `intent=race` hands the choice to the existing host flow as `urlPuzzle`
 *   (HostNameScreen: name → room), after tearing down the finished solo or
 *   room state the way the old "Play live" bridge did.
 * - `intent=next` keeps the room: the puzzle is uploaded and `createNextGame`
 *   is called with ITS id — the room code stays and the other players follow
 *   the `new_game` broadcast to the lobby. Falls back to the race path when
 *   there is no room to keep.
 */
export function PuzzlePickerScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const intent: PickerIntent = params.get("intent") === "next" ? "next" : "race";
  const { user } = useAuth();
  const game = useGame();
  const mp = useMultiplayerContext();

  // The puzzle on screen when the picker opened has just been finished: it is
  // never offered, even before the stats catch up.
  const [finishedKey] = useState(() => (game.puzzle && game.isComplete ? puzzleIdentity(game.puzzle) : null));
  const dailies = useTodaysDailies();
  const bestTimes = useBestTimes();
  const openDailies = useMemo(() => unsolvedDailies(dailies, bestTimes, finishedKey), [dailies, bestTimes, finishedKey]);
  const dailiesSettled = dailies.mini !== undefined && dailies.midi !== undefined && dailies.large !== undefined;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(
    async (puzzle: Puzzle, key: string, slot?: DailySlot) => {
      setError(null);
      setBusy(key);
      try {
        const keepRoom = intent === "next" && !!user && !!mp.shareCode;
        track("mode_selected", { mode: keepRoom ? "next-puzzle" : "picker-race", slot });
        if (keepRoom) {
          const puzzleId = await uploadPuzzle(puzzle);
          if (!puzzleId) throw new Error("upload failed");
          const displayName = game.displayName.trim() || tStatic("common.defaultPlayerName");
          const result = await createNextGame(puzzleId, user.id, mp.shareCode!, { displayName });
          if (!result) throw new Error("next game failed");
          game.loadPuzzle(puzzle);
          mp.broadcastNewGame(result.gameId);
          game.setGameId(result.gameId);
          game.setCompletionModalDismissed(false);
          saveMpSession({ gameId: result.gameId, shareCode: result.shortCode, displayName: game.displayName });
          navigate(`/lobby/${result.gameId}`, { replace: true });
          return;
        }
        // A fresh room: drop the finished solo/room state so the host flow
        // starts clean — the solved puzzle is never re-raced live.
        game.reset();
        game.setGameId(null);
        game.setIsMultiplayer(false);
        localStorage.removeItem(STORAGE_KEY);
        clearMpSession();
        clearSoloTimer();
        clearChallenge();
        game.setCompletionModalDismissed(false);
        game.setUrlPuzzle(puzzle);
        navigate("/host-game/name", { replace: true });
      } catch {
        setError(t("picker.error"));
        setBusy(null);
      }
    },
    [intent, user, mp, game, navigate, t],
  );

  return (
    <PageShell width="5xl" bar={{ backLabel: t("picker.back"), onBack: () => navigate(-1) }}>
      <div className="pb-5 pt-4 text-center sm:pt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("picker.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted sm:text-base">
          {t(intent === "next" ? "picker.subtitleNext" : "picker.subtitleRace")}
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      <section aria-labelledby="picker-dailies" className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="size-4 text-gold-700" aria-hidden="true" />
          <Eyebrow as="h2" id="picker-dailies">{t("picker.todaysDailies")}</Eyebrow>
        </div>
        {openDailies.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {openDailies.map(({ slot, daily }) => {
              const key = `daily:${slot}`;
              return (
                <li key={slot}>
                  <Card className="relative flex h-full items-center gap-4 p-4 transition-[box-shadow,border-color] duration-150 hover:border-line-strong hover:shadow-raised">
                    <MiniGridThumb puzzle={daily.puzzle} className="w-16 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Eyebrow>{t(SLOT_EYEBROW[slot])}</Eyebrow>
                      <p className="mt-0.5 truncate font-display text-lg font-bold leading-snug text-ink">{daily.puzzle.title}</p>
                      <p className="truncate text-sm text-muted tabular-nums">
                        {daily.puzzle.width}×{daily.puzzle.height}
                        {displayTheme(daily) ? ` · ${displayTheme(daily)}` : ""}
                      </p>
                    </div>
                    <Button
                      variant="soft"
                      onClick={() => void choose(daily.puzzle, key, slot)}
                      disabled={busy !== null}
                      className="shrink-0 after:absolute after:inset-0 after:rounded-2xl"
                    >
                      {busy === key && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                      {busy === key ? t("picker.setting") : t("picker.pick")}
                    </Button>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-2xl bg-surface-sunken px-4 py-5 text-center text-sm text-muted" aria-busy={!dailiesSettled}>
            {dailiesSettled ? t("picker.allDailiesSolved") : t("picker.loading")}
          </p>
        )}
      </section>
    </PageShell>
  );
}
