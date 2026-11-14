import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Flame, Loader2, Swords, Trophy, Users, WifiOff } from "lucide-react";
import { PageShell, type ShellWidth } from "../components/PageShell";
import { BoardSignForm } from "../components/BoardSignForm";
import { Button, Card, Eyebrow } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useDailyPuzzle } from "../hooks/useDailyMini";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { DAILY_SLOTS, isDailySlot, type DailySlot, displayTheme } from "../lib/dailyFeed";
import type { DailyMini } from "../lib/dailyMinis";
import {
  boardDay,
  boardPostsHere,
  fetchDailyLeaderboard,
  mergeOwnResult,
  pendingResultFor,
  shiftDay,
  signDailyResult,
  dailyPostingNotice,
  todayKey,
  updateDailyDisplayName,
  withUnpostedTime,
  type RankedDailyEntry,
} from "../lib/dailyLeaderboard";
import { knownPublishedIndex, loadPublishedIndex, type DailyIndexEntry } from "../lib/dailyIndex";
import { friendsEnabled } from "../lib/friends";
import { useFriends } from "../contexts/FriendsContext";
import { isRealPlayerName, savePlayerName } from "../lib/playerName";
import { formatDuration, puzzleIdentity } from "../lib/soloStats";
import { useBestTimes, useStreaks } from "../hooks/useSolveHistory";
import { BoardTable } from "../components/Leaderboard/BoardTable";
import { supabase } from "../lib/supabaseClient";
import { track } from "../lib/analytics";
import { pickerPath } from "./PuzzlePickerScreen";
import { useMaybeAccount } from "../contexts/AccountContext";
import { useRaceCandidates } from "../hooks/useRace";
import { saveRaceIntent } from "../lib/race";
import { dailyPath } from "../lib/dailyChallenge";

/** Tailwind's `lg` breakpoint (64rem) — the width at which the boards spread out. */
const LG_QUERY = "(min-width: 64rem)";

/** Medal treatment for the podium, all in gold tokens (gold -> pale gold). */

const TITLE: Record<DailySlot, string> = {
  mini: "leaderboard.title",
  midi: "leaderboard.titleMidi",
  large: "leaderboard.titleLarge",
};
const SLOT_LABEL: Record<DailySlot, string> = {
  mini: "menu.dailyMiniEyebrow",
  midi: "menu.dailyMidiEyebrow",
  large: "menu.dailyLargeEyebrow",
};
const PLAY_TODAY: Record<DailySlot, string> = {
  mini: "leaderboard.playToday",
  midi: "leaderboard.playTodayMidi",
  large: "leaderboard.playTodayLarge",
};

/** Column count → the lg grid and the shell width that fits it (spelled out for Tailwind's scanner). */
const WIDE_GRID: Record<number, { grid: string; width: ShellWidth }> = {
  1: { grid: "", width: "2xl" },
  2: { grid: "lg:grid-cols-2 lg:gap-6", width: "5xl" },
  3: { grid: "lg:grid-cols-3 lg:gap-5", width: "5xl" },
};

/** Whether the board shows only the viewer and their friends; remembered per device. */
const FRIENDS_ONLY_KEY = "crossword-clash:board-friends-only";
function readFriendsOnly(): boolean {
  try {
    return localStorage.getItem(FRIENDS_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}
function writeFriendsOnly(on: boolean) {
  try {
    if (on) localStorage.setItem(FRIENDS_ONLY_KEY, "1");
    else localStorage.removeItem(FRIENDS_ONLY_KEY);
  } catch {
    // A blocked store only costs the memory of the choice.
  }
}

const STEP_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-surface-sunken active:bg-line disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-500";

/** Message panel used for the loading / empty / offline states. */
function BoardMessage({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
      <span className="grid size-10 place-items-center rounded-full bg-surface-sunken text-subtle">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

/**
 * Cross-day leaderboards, one per daily slot — /daily/leaderboard for the
 * mini, /daily/leaderboard/midi and /large for the others: today's fastest
 * solves (solo + live races), the viewer's own row highlighted, and their
 * streak. Offline (no Supabase env) it degrades to the streak + a friendly
 * note — the solo path never breaks.
 *
 * On a phone the page is the route's one board. From `lg` up it uses the
 * width: today's boards side by side in slot order (a slot with nothing
 * published shows nothing), each with its own sign form and Play / Race.
 *
 * A finish made just before arriving is held in GameContext: a board's first
 * fetch waits for that submission to land (so the first finisher of the day
 * never sees an empty board), the viewer's own row shows at once, and the
 * board refetches whenever the tab comes back (navigation audit §3, item 9).
 * A finish under the default name is parked unposted — it shows here, on
 * this device, with the sign form that posts it — and a page that is not
 * production (a preview, local dev) posts nothing and says so.
 */
export function DailyLeaderboardScreen() {
  const { t } = useTranslation();
  const params = useParams();
  const routeSlot: DailySlot = isDailySlot(params.slot) ? params.slot : "mini";
  const wide = useMediaQuery(LG_QUERY);
  const { daily: streak } = useStreaks();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const today = todayKey();

  // Past boards (Andrew, 2026-11-10): `?day=YYYY-MM-DD` shows that day's
  // board, read-only. The daily index names the day's puzzles (title, theme
  // and the identity the viewer's own time is filed under) and bounds how far
  // back the stepper goes; until it answers, a past day still shows its rows.
  const [search, setSearch] = useSearchParams();
  const [index, setIndex] = useState<DailyIndexEntry[] | null>(() => knownPublishedIndex(today));
  useEffect(() => {
    let alive = true;
    void loadPublishedIndex(today).then((entries) => {
      if (alive && entries) setIndex(entries);
    });
    return () => {
      alive = false;
    };
  }, [today]);
  const first = useMemo(() => (index && index.length > 0 ? index.reduce((min, e) => (e.day < min ? e.day : min), index[0].day) : null), [index]);
  const pastDay = boardDay(search.get("day"), today, first);
  const day = pastDay ?? today;
  const past = pastDay !== null;
  const pastBySlot = useMemo(() => {
    const bySlot: Partial<Record<DailySlot, DailyIndexEntry>> = {};
    if (pastDay && index) for (const e of index) if (e.day === pastDay) bySlot[e.slot] = e;
    return bySlot;
  }, [pastDay, index]);
  const goToDay = useCallback(
    (next: string) => {
      const params = new URLSearchParams(search);
      if (next >= today) params.delete("day");
      else params.set("day", next);
      setSearch(params);
    },
    [search, setSearch, today],
  );
  const dayLabel = useMemo(() => {
    const [y, m, d] = day.split("-").map(Number);
    return new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
  }, [day, i18n.language]);

  // Friends only (same day): the viewer and their friends, ranked among
  // themselves. Offered once there is a friend to show; remembered per device.
  const friends = useFriends();
  const friendIds = useMemo(
    () => (friendsEnabled() && friends.active ? friends.friendships.friends.map((f) => f.userId) : []),
    [friends.active, friends.friendships.friends],
  );
  const canFilter = !!user && friendIds.length > 0;
  const [friendsOnly, setFriendsOnly] = useState(readFriendsOnly);
  const chooseFriendsOnly = useCallback(
    (on: boolean) => {
      setFriendsOnly(on);
      writeFriendsOnly(on);
      track("leaderboard_filter", { friends_only: on, slot: routeSlot });
    },
    [routeSlot],
  );
  const only = useMemo(() => (canFilter && friendsOnly && user ? [user.id, ...friendIds] : null), [canFilter, friendsOnly, user, friendIds]);
  const onlyKey = only ? only.join(",") : "";

  // Undefined while a feed answers; null when the slot has nothing today.
  const dailies: Record<DailySlot, DailyMini | null | undefined> = {
    mini: useDailyPuzzle("mini"),
    midi: useDailyPuzzle("midi"),
    large: useDailyPuzzle("large"),
  };

  useEffect(() => {
    if (supabase) track("leaderboard_viewed", { day, slot: routeSlot });
  }, [day, routeSlot]);

  // Wide: every slot with a puzzle that day (today, a feed still answering
  // keeps its column until it says null, like the menu's tiles; a past day,
  // the slots the index lists). Phone: the route's.
  const wideSlots = past ? DAILY_SLOTS.filter((slot) => pastBySlot[slot]) : DAILY_SLOTS.filter((slot) => dailies[slot] !== null);
  const slots: readonly DailySlot[] = wide && wideSlots.length > 0 ? wideSlots : [routeSlot];
  const layout = WIDE_GRID[slots.length] ?? WIDE_GRID[3];
  const sideBySide = slots.length > 1;
  const routeDaily = dailies[routeSlot];
  const routeTheme = past ? pastBySlot[routeSlot]?.theme || pastBySlot[routeSlot]?.title : displayTheme(routeDaily);

  return (
    <PageShell width="md" widthMd="5xl" widthLg={layout.width} bar={{ backLabel: t("completion.backToMenu") }}>
      <div className="mt-4 grid gap-4 sm:mt-6">
        <div className="text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
            <Trophy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            {t(sideBySide ? (past ? "leaderboard.titleAllPast" : "leaderboard.titleAll") : TITLE[routeSlot])}
          </h1>
          {!sideBySide && routeTheme && (
            <p className="mt-1.5 text-sm text-muted">{past ? routeTheme : t("menu.dailyMiniTheme", { theme: routeTheme })}</p>
          )}
          {streak > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 text-sm font-semibold text-gold-700 ring-1 ring-gold-100">
              <Flame className="size-4" aria-hidden="true" />
              {t("soloStats.streakDays", { count: streak })}
            </p>
          )}
        </div>

        {/* Which day, and whose times. The stepper is bounded by the first
            published daily and by today; both controls are 44 px targets. */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <div data-testid="board-day" className="flex items-center gap-1">
            <button
              type="button"
              className={STEP_BUTTON}
              onClick={() => goToDay(shiftDay(day, -1))}
              disabled={!first || day <= first}
              aria-label={t("leaderboard.previousDay")}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <p className="min-w-32 text-center text-sm font-semibold text-ink tabular-nums" aria-live="polite">
              {past ? dayLabel : t("leaderboard.today")}
            </p>
            <button
              type="button"
              className={STEP_BUTTON}
              onClick={() => goToDay(shiftDay(day, 1))}
              disabled={!past}
              aria-label={t("leaderboard.nextDay")}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
          {canFilter && (
            <div role="group" aria-label={t("leaderboard.whose")} className="inline-flex rounded-xl bg-surface-sunken p-1 ring-1 ring-line">
              {([false, true] as const).map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  aria-pressed={friendsOnly === on}
                  onClick={() => chooseFriendsOnly(on)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${
                    friendsOnly === on ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
                  }`}
                >
                  {on && <Users className="size-4" aria-hidden="true" />}
                  {t(on ? "leaderboard.friends" : "leaderboard.everyone")}
                </button>
              ))}
            </div>
          )}
        </div>
        {past && (
          <p className="-mt-1 text-center text-xs text-muted">
            {t("leaderboard.pastNote")}{" "}
            <button type="button" onClick={() => goToDay(today)} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
              {t("leaderboard.backToToday")}
            </button>
          </p>
        )}

        <div data-testid="boards" className={`grid items-start gap-4 ${layout.grid}`}>
          {slots.map((slot) => (
            // Keyed by what the board shows, so a new day or filter starts from its loading state.
            <SlotBoard
              key={`${slot}:${day}:${onlyKey}`}
              slot={slot}
              day={day}
              past={past}
              info={past ? pastBySlot[slot] ?? null : null}
              only={only}
              daily={past ? null : dailies[slot]}
              labelled={sideBySide}
            />
          ))}
        </div>
      </div>
    </PageShell>
  );
}

interface SlotBoardProps {
  slot: DailySlot;
  /** The board's day: today, or a past day shown read-only. */
  day: string;
  past: boolean;
  /** A past day's puzzle as the daily index lists it; null today, or when the index does not know it. */
  info: DailyIndexEntry | null;
  /** The friends-only board: these players' rows and no others. */
  only: readonly string[] | null;
  /** Today's puzzle; null on a past day. */
  daily: DailyMini | null | undefined;
  /** Side by side, each board names its slot (the page title no longer does). */
  labelled: boolean;
}

/** One slot's board: the table, the sign form when the viewer's row needs a name, and Play / Race. */
function SlotBoard({ slot, day, past, info, only, daily, labelled }: SlotBoardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();
  const bestTimes = useBestTimes();

  const postsHere = boardPostsHere();
  // A past day takes no new time: nothing is pending, signed or posted there.
  const pending = past ? null : pendingResultFor(game.pendingDailyResult, day, slot);
  const own = pending?.posted ? pending.entry : null;
  const privateFinish = pending && !pending.posted ? pending.entry : null;
  const postingNotice = dailyPostingNotice(pending);

  // null = loading; [] = loaded empty.
  const [entries, setEntries] = useState<RankedDailyEntry[] | null>(
    supabase ? null : [],
  );

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = async () => {
      // A finish posted from this tab lands before the board is read.
      if (pending) await pending.settled;
      const rows = await fetchDailyLeaderboard(day, slot, 50, only);
      if (alive) setEntries(mergeOwnResult(rows, pending?.posted ? pending.entry : null));
    };
    void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
    // `pending` is replaced by a new finish and by signing one (which posts it).
    // `only` is fixed for this board's life (the parent keys the board by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, day, pending]);

  // Race a row's recorded solve (race.ts; Plus), offered until the viewer has
  // a finish of their own on this board. The puzzle opens with that player
  // ticked in its race picker.
  const account = useMaybeAccount();
  const puzzleKey = past ? info?.identity ?? null : daily ? puzzleIdentity(daily.puzzle) : null;
  const solvedHere = !!own || !!privateFinish || (!!entries && !!user && entries.some((e) => e.userId === user.id));
  const raceCandidates = useRaceCandidates(puzzleKey, !solvedHere);
  const raceable = useMemo(() => new Set(raceCandidates.map((c) => c.userId)), [raceCandidates]);
  const raceRow = useCallback(
    (userId: string) => {
      if (!puzzleKey || !account) return;
      if (!account.plus) {
        account.openPaywall({ placement: "leaderboard_race", feature: "race" });
        return;
      }
      saveRaceIntent({ key: puzzleKey, userIds: [userId] });
      track("leaderboard_race", { slot, past });
      navigate(dailyPath(day, slot));
    },
    [puzzleKey, account, slot, past, navigate, day],
  );

  // While the server answers, the viewer's posted finish is already a row
  // (rank unknown yet, drawn as "–").
  const shown = useMemo<RankedDailyEntry[] | null>(() => {
    if (entries !== null) return own ? mergeOwnResult(entries, own) : entries;
    return own ? [{ ...own, rank: 0 }] : null;
  }, [entries, own]);
  const loading = supabase !== null && entries === null;

  // Guests sign private finishes explicitly. The same form can rename a
  // default-name row from an older client; held results cannot be posted.
  const myEntry = shown?.find((e) => e.userId === user?.id);
  const signEntry = privateFinish ?? myEntry;
  const needsName = !past && !!signEntry && !pending?.postingHold && (privateFinish || !isRealPlayerName(signEntry.displayName)) && postsHere;
  const unposted = !!pending && !pending.posted;
  const [signedAs, setSignedAs] = useState<string | null>(null);
  const saveName = useCallback(
    (trimmed: string) => {
      if (!trimmed || !user || pending?.postingHold) return;
      game.setDisplayName(trimmed);
      savePlayerName(trimmed);
      if (pending) game.setPendingDailyResult(signDailyResult(pending, trimmed));
      else void updateDailyDisplayName(day, user.id, trimmed, slot);
      setSignedAs(trimmed);
      // Reflect immediately in the fetched rows (the pending finish carries the name itself).
      setEntries((prev) =>
        prev?.map((e) => (e.userId === user.id ? { ...e, displayName: trimmed } : e)) ?? prev,
      );
    },
    [user, game, day, slot, pending],
  );

  // Solved today's slot: the finish just made, the board's own row, or a best
  // time on record for this puzzle (local stats or the account's history).
  const identity = past ? info?.identity ?? null : daily ? puzzleIdentity(daily.puzzle) : null;
  const solvedSeconds = pending?.entry.seconds ?? myEntry?.seconds ?? (identity ? bestTimes[identity] : undefined);
  const solved = typeof solvedSeconds === "number";
  const myRank = !privateFinish && myEntry && myEntry.rank > 0 ? myEntry.rank : null;

  // A past board the viewer was not on, for a puzzle they have since solved:
  // their time is slotted in where it would have placed, marked as not on the
  // board. Nothing is written; a daily ranks only on its own day.
  const rows = useMemo<RankedDailyEntry[] | null>(() => {
    if (!past || shown === null || myEntry || !user || typeof solvedSeconds !== "number") return shown;
    return withUnpostedTime(shown, { userId: user.id, displayName: game.displayName, mode: "solo", seconds: solvedSeconds });
  }, [past, shown, myEntry, user, solvedSeconds, game.displayName]);
  const wouldBe = past && !myEntry ? rows?.find((e) => e.unposted) ?? null : null;

  const playToday = useCallback(async () => {
    track("mode_selected", { mode: "daily", slot });
    if (!daily) return;
    if (await game.handleSoloPuzzleLoaded(daily.puzzle) === false) return;
    game.setSoloTheme(daily.theme);
    navigate("/solo/play");
  }, [game, daily, slot, navigate]);

  const raceFriends = useCallback(() => {
    if (solved) {
      // Already solved: a fresh puzzle through the picker, never this one.
      track("mode_selected", { mode: "daily-race-fresh", slot });
      navigate(pickerPath("race"));
      return;
    }
    track("mode_selected", { mode: "daily-race", slot });
    // Hand the daily to the existing host flow (name → lobby) — the
    // same mechanic used for imported puzzles, no import step.
    if (!daily) return;
    game.setUrlPuzzle(daily.puzzle);
    navigate("/host-game/name");
  }, [game, daily, slot, solved, navigate]);

  const theme = past ? info?.theme || info?.title || "" : displayTheme(daily);
  const emptyMessage = only ? "leaderboard.emptyFriends" : past ? "leaderboard.emptyPast" : "leaderboard.empty";

  return (
    <section data-testid={`board-${slot}`} aria-label={t(TITLE[slot])} className="grid min-w-0 gap-4">
      {labelled && (
        <div className="px-1 text-center">
          <Eyebrow as="h2">{t(SLOT_LABEL[slot])}</Eyebrow>
          {/* Fixed-height theme line, so three boards' tables start on one row. */}
          <p className="mt-1 h-5 truncate text-sm text-muted">{theme ? (past ? theme : t("menu.dailyMiniTheme", { theme })) : ""}</p>
        </div>
      )}

      <Card className="overflow-hidden">
        {!supabase ? (
          <BoardMessage icon={<WifiOff className="size-5" aria-hidden="true" />}>{t("leaderboard.offline")}</BoardMessage>
        ) : rows === null ? (
          <div role="status">
            <BoardMessage icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>
              {t("leaderboard.loading")}
            </BoardMessage>
          </div>
        ) : rows.length === 0 ? (
          <BoardMessage icon={<Trophy className="size-5" aria-hidden="true" />}>{t(emptyMessage)}</BoardMessage>
        ) : (
          <>
            <BoardTable rows={rows} userId={user?.id} raceable={raceable} onRace={raceRow} />
            {loading && (
              <p role="status" className="flex items-center justify-center gap-2 border-t border-line px-4 py-2.5 text-center text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t("leaderboard.posting")}
              </p>
            )}
          </>
        )}
      </Card>

      {pending && !postsHere && (
        <p data-testid="board-not-posted" className="text-center text-xs text-muted">
          {t("leaderboard.notPosted")}
        </p>
      )}

      {postingNotice && postsHere && <p role="status" className="text-center text-sm text-muted">{t(postingNotice)}</p>}

      {(needsName || signedAs) && signEntry && !pending?.postingHold && (
        <BoardSignForm currentName={signEntry.displayName} signedAs={signedAs} unposted={unposted} onSign={saveName} />
      )}

      {past && (
        <div className="grid gap-2.5">
          {solved ? (
            <p
              data-testid="solved-line"
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-center text-sm font-semibold text-brand-700 ring-1 ring-brand-100 tabular-nums"
            >
              <Check className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {wouldBe
                  ? t("leaderboard.wouldHavePlaced", { time: formatDuration(solvedSeconds), rank: wouldBe.rank, total: rows?.length ?? 1 })
                  : `${t("leaderboard.solvedIn", { time: formatDuration(solvedSeconds) })}${myRank !== null ? ` · ${t("leaderboard.rankThatDay", { rank: myRank })}` : ""}`}
              </span>
            </p>
          ) : (
            info && (
              <Button size="lg" variant="secondary" block onClick={() => navigate(`/archive?day=${day}`)}>
                {t("leaderboard.playThatDay")}
              </Button>
            )
          )}
        </div>
      )}

      {!past && daily !== null && (
        <div className="grid gap-2.5">
          {solved ? (
            <p
              data-testid="solved-line"
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-center text-sm font-semibold text-brand-700 ring-1 ring-brand-100 tabular-nums"
            >
              <Check className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {t("leaderboard.solvedIn", { time: formatDuration(solvedSeconds) })}
                {myRank !== null && ` · ${t("leaderboard.rankToday", { rank: myRank })}`}
              </span>
            </p>
          ) : (
            <Button size="lg" block onClick={playToday} disabled={!daily}>
              {t(PLAY_TODAY[slot])}
            </Button>
          )}
          {user && (
            <Button size="lg" variant={solved ? "primary" : "secondary"} block onClick={raceFriends} disabled={!solved && !daily}>
              <Swords className="size-4.5" aria-hidden="true" />
              {t("leaderboard.raceFriends")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
