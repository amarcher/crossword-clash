import { useMemo, useState } from "react";
import { displayTheme } from "../lib/dailyFeed";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, Loader2, Newspaper, Sparkles, Upload, Users } from "lucide-react";
import { nativeNytImportAvailable } from "../lib/nativeNytImport";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, ListGroup, ListRow, MiniGridThumb } from "../components/ui";
import { ShapeThumb } from "../components/ui/ShapeThumb";
import { SegmentedControl } from "../components/GameLobby/SegmentedControl";
import { useGame } from "../contexts/GameContext";
import { useAuth } from "../contexts/AuthContext";
import { useMultiplayerContext } from "../contexts/MultiplayerContext";
import { useFreshPuzzles } from "../hooks/useFreshPuzzles";
import { DAILY_SLOTS, fetchDailyForDay } from "../lib/dailyFeed";
import type { DailyIndexEntry } from "../lib/dailyIndex";
import { useBestTimes } from "../hooks/useSolveHistory";
import { useTodaysDailies } from "../hooks/useNextUp";
import { unsolvedDailies } from "../lib/nextUp";
import { puzzleIdentity } from "../lib/soloStats";
import type { DailySlot } from "../lib/dailyFeed";
import { pickerPath, usePickPuzzle, type PickerIntent } from "../hooks/usePickPuzzle";

export { pickerPath };
export type { PickerIntent };

const SLOT_TAB = { mini: "leaderboard.tabMini", midi: "leaderboard.tabMidi", large: "leaderboard.tabLarge" } as const satisfies Record<DailySlot, string>;
const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const satisfies Record<DailySlot, string>;

/**
 * The puzzle picker for a room: today's dailies the solver hasn't finished,
 * past dailies of a chosen size that nobody about to play has finished
 * (useFreshPuzzles), then past puzzles and community puzzles, each opened in pick mode (`?pick=`)
 * so its button picks for the room (Andrew, 2026-11-19: not only today's).
 * It never offers the puzzle just solved. What a pick does is `usePickPuzzle`.
 */
export function PuzzlePickerScreen() {
  const { t, i18n } = useTranslation();
  const goBack = useNavigate();
  const [params] = useSearchParams();
  const intent: PickerIntent = params.get("intent") === "next" ? "next" : "race";
  const game = useGame();

  // The puzzle on screen when the picker opened has just been finished: it is
  // never offered, even before the stats catch up.
  const [finishedKey] = useState(() => (game.puzzle && game.isComplete ? puzzleIdentity(game.puzzle) : null));
  const dailies = useTodaysDailies();
  const bestTimes = useBestTimes();
  const openDailies = useMemo(() => unsolvedDailies(dailies, bestTimes, finishedKey), [dailies, bestTimes, finishedKey]);
  const dailiesSettled = dailies.mini !== undefined && dailies.midi !== undefined && dailies.large !== undefined;
  const { choose, busy, error, fail } = usePickPuzzle(intent);

  // Past dailies nobody about to play has finished: the room's people when
  // this host is changing its puzzle, else just the player.
  const { user } = useAuth();
  const mp = useMultiplayerContext();
  const roomId = intent === "next" && !!user && !!mp.shareCode && mp.isHost ? game.gameId : null;
  const [size, setSize] = useState<DailySlot>("midi");
  const fresh = useFreshPuzzles(size, roomId);
  const chooseFresh = async (entry: DailyIndexEntry) => {
    const daily = await fetchDailyForDay(entry.day, entry.slot);
    if (!daily) return fail();
    await choose(daily.puzzle, entry.identity, entry.slot);
  };
  const dayLabel = useMemo(() => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }), [i18n.language]);

  return (
    <PageShell width="5xl" bar={{ backLabel: t("picker.back"), onBack: () => goBack(-1) }}>
      <div className="pb-5 pt-4 text-center sm:pt-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("picker.title")}</h1>
        {/* Starting a room needs no telling; a room already open is told its code stays. */}
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

      <section aria-labelledby="picker-fresh" className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="size-4 text-gold-700" aria-hidden="true" />
            <Eyebrow as="h2" id="picker-fresh">{t(roomId ? "picker.freshRoom" : "picker.freshSolo")}</Eyebrow>
          </div>
          <SegmentedControl
            label={t("picker.size")}
            options={DAILY_SLOTS.map((slot) => ({ value: slot, label: t(SLOT_TAB[slot]) }))}
            value={size}
            onChange={setSize}
          />
          <ul className={`grid gap-3 sm:grid-cols-3 ${fresh?.length === 0 ? "" : "mt-3"}`} aria-busy={fresh === undefined}>
            {(fresh ?? []).map((entry) => (
              <li key={entry.identity}>
                <Card className="relative flex h-full items-center gap-4 p-4 transition-[box-shadow,border-color] duration-150 hover:border-line-strong hover:shadow-raised">
                  <ShapeThumb blocks={entry.blocks} className="w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg font-bold leading-snug text-ink">{entry.title}</p>
                    <p className="truncate text-sm text-muted tabular-nums">
                      {dayLabel.format(new Date(`${entry.day}T12:00:00`))}
                      {entry.theme ? ` · ${entry.theme}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="soft"
                    onClick={() => void chooseFresh(entry)}
                    disabled={busy !== null}
                    className="shrink-0 after:absolute after:inset-0 after:rounded-2xl"
                  >
                    {busy === entry.identity && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                    {busy === entry.identity ? t("picker.setting") : t("picker.pick")}
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
          {fresh?.length === 0 && <p className="mt-3 rounded-2xl bg-surface-sunken px-4 py-5 text-center text-sm text-muted">{t("picker.freshNone")}</p>}
        </section>

      <ListGroup className="mb-8">
        <ListRow icon={CalendarDays} to={`/archive?pick=${intent}`} title={t("menu.pastPuzzles")} />
        <ListRow icon={Users} to={`/puzzles?pick=${intent}`} title={t("menu.communityPuzzles")} />
        {nativeNytImportAvailable() && <ListRow icon={Newspaper} tone="neutral" to={`/nyt-import?pick=${intent}`} title={t("nytImport.title")} />}
        <ListRow icon={Upload} tone="neutral" to={`/solo/import?pick=${intent}`} title={t("menu.ownPuzzle")} />
      </ListGroup>
    </PageShell>
  );
}
