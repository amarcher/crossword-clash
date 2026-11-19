import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Flag, Flame, Loader2, Lock, Trophy, Users, WifiOff } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { BoardTable } from "../components/Leaderboard/BoardTable";
import { BoardTabs } from "../components/Leaderboard/BoardTabs";
import { Button, Card } from "../components/ui";
import { PlusBadge } from "../components/ui/PlusBadge";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useMaybeAccount } from "../contexts/AccountContext";
import { useBestTimes, useStreaks } from "../hooks/useSolveHistory";
import { friendsEnabled } from "../lib/friends";
import { useFriends } from "../contexts/FriendsContext";
import { readFriendsOnly, subscribeFriendsOnly, writeFriendsOnly } from "../lib/boardPrefs";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { BOARD_CARDS, cachedBonusCards, fetchBonusCards, loadBonusPuzzle, shapePuzzle, type BonusCard } from "../lib/bonus";
import { prefetchRaceCandidates, useRaceCandidates } from "../hooks/useRace";
import { loadPublishedIndex } from "../lib/dailyIndex";
import { useRaceName } from "../hooks/useRaceName";
import { fetchOwnSolveTrace, fetchSolveTrace, GHOST_COLORS, saveRaceIntent } from "../lib/race";
import { RACE_SELF_COLOR, type RaceSolve } from "../lib/friendRace";
import { loadViewerRace } from "../lib/viewerRace";
import { FriendRaceDialog } from "../components/Race/FriendRaceDialog";
import { ReplayDialog, type ReplaySolve } from "../components/Race/ReplayDialog";
import type { Puzzle } from "../types/puzzle";
import {
  boardPostsHere,
  cachedDailyLeaderboard,
  fetchDailyLeaderboard,
  leaderboardPath,
  mergeOwnResult,
  pendingResultFor,
  prefetchDailyLeaderboards,
  todayKey,
  withUnpostedTime,
  type RankedDailyEntry,
} from "../lib/dailyLeaderboard";
import { formatDuration } from "../lib/soloStats";
import { supabase } from "../lib/supabaseClient";
import { track } from "../lib/analytics";

const STEP_BUTTON =
  "grid size-11 shrink-0 place-items-center rounded-xl text-ink-soft hover:bg-surface-sunken active:bg-line disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-brand-500";

function BoardMessage({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
      <span className="grid size-10 place-items-center rounded-full bg-surface-sunken text-subtle">{icon}</span>
      <p>{children}</p>
    </div>
  );
}

/**
 * The bonus puzzle's leaderboard, `/bonus/leaderboard` (bonus.ts; migration
 * 20261120000000_bonus_board.sql): the day's fastest bonus solves, read by
 * everyone and written only by Plus, since only Plus gets the puzzle. A time
 * is posted on the bonus's own day; `?day=` shows a past day's board, final.
 * Under it a Plus player who hasn't solved the day's bonus gets Play, anyone
 * else the pitch (`paywall_viewed { placement: "bonus-board" }`).
 *
 * Races work as on a daily's board (Andrew, 2026-11-18): Race on a row before
 * the viewer has solved it, Watch after, and the friends' race under the
 * table. Without Plus the puzzle is never loaded: the friends' race plays on
 * the card's shape as squares only (free, as on a daily), and Race or "Let me
 * solve it" opens the paywall.
 */
export function BonusLeaderboardScreen() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const game = useGame();
  const account = useMaybeAccount();
  const navigate = useTransitionNavigate();
  const bestTimes = useBestTimes();
  const { daily: streak } = useStreaks();
  // Everyone or friends only, as on a daily's board and remembered with it (Andrew, 2026-11-19:
  // the Plus board looks like the others).
  const friends = useFriends();
  const friendIds = useMemo(
    () => (friendsEnabled() && friends.active ? friends.friendships.friends.map((f) => f.userId) : []),
    [friends.active, friends.friendships.friends],
  );
  const canFilter = !!user && friendIds.length > 0;
  const friendsOnly = useSyncExternalStore(subscribeFriendsOnly, readFriendsOnly, () => false);
  const chooseFriendsOnly = (on: boolean) => {
    writeFriendsOnly(on);
    track("leaderboard_filter", { friends_only: on, slot: "bonus" });
  };
  const only = useMemo(() => (canFilter && friendsOnly && user ? [user.id, ...friendIds] : null), [canFilter, friendsOnly, user, friendIds]);
  const onlyKey = only ? only.join(",") : "";
  const today = todayKey();

  // Released bonuses up to today, oldest first: the days the stepper walks.
  // Cards fetched earlier this session (the daily boards ask ahead) draw at once; the fetch corrects them.
  const released = useCallback((rows: BonusCard[]) => rows.filter((c) => c.day <= today).reverse(), [today]);
  const [cards, setCards] = useState<BonusCard[] | null>(() => {
    if (!supabase) return [];
    const kept = cachedBonusCards(BOARD_CARDS);
    return kept ? released(kept) : null;
  });
  useEffect(() => {
    let live = true;
    void fetchBonusCards(BOARD_CARDS).then((rows) => live && setCards(released(rows)));
    return () => {
      live = false;
    };
  }, [released]);

  const asked = params.get("day");
  const day = asked && cards?.some((c) => c.day === asked) ? asked : today;
  const past = day !== today;
  const index = cards?.findIndex((c) => c.day === day) ?? -1;
  const card = index >= 0 ? cards![index] : null;
  const previous = cards && (index > 0 ? cards[index - 1] : index < 0 ? [...cards].reverse().find((c) => c.day < day) : undefined);
  const next = cards && index >= 0 ? cards[index + 1] : undefined;
  const goToDay = useCallback((d: string) => setParams(d === today ? {} : { day: d }, { replace: true }), [setParams, today]);

  useEffect(() => {
    if (supabase) track("leaderboard_viewed", { day, slot: "bonus" });
  }, [day]);

  const pending = past ? null : pendingResultFor(game.pendingDailyResult, day, "bonus");
  const own = pending?.posted ? pending.entry : null;
  const [entries, setEntries] = useState<{ day: string; only: string; rows: RankedDailyEntry[] } | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = async () => {
      // A finish posted from this tab lands before the board is read.
      if (pending) await pending.settled;
      const rows = await fetchDailyLeaderboard(day, "bonus", 50, only);
      if (alive) setEntries({ day, only: onlyKey, rows });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `only` by its key
  }, [day, pending, onlyKey]);

  // Fetch the other tabs' boards ahead of the tap, so switching draws at once.
  useEffect(() => {
    if (!supabase) return;
    prefetchDailyLeaderboards(day, ["bonus"]);
    // And the daily tabs' race buttons, as the daily boards do for each other.
    if (!user) return;
    void loadPublishedIndex(todayKey())
      .then((entries) => entries && prefetchRaceCandidates(entries.filter((e) => e.day === day).map((e) => e.identity)))
      .catch(() => {});
  }, [day, user]);

  // A day already fetched this session shows that answer while the fetch corrects it.
  const loaded = !supabase ? [] : entries?.day === day && entries.only === onlyKey ? entries.rows : cachedDailyLeaderboard(day, "bonus", 50, only);
  const shown = useMemo<RankedDailyEntry[] | null>(() => {
    if (loaded !== null) return own ? mergeOwnResult(loaded, own) : loaded;
    return own ? [{ ...own, rank: 0 }] : null;
  }, [loaded, own]);
  const myEntry = shown?.find((e) => e.userId === user?.id);
  const solvedSeconds = pending?.entry.seconds ?? myEntry?.seconds ?? (card ? bestTimes[card.identity] : undefined);
  const solved = typeof solvedSeconds === "number";
  // A past board the viewer was not on, for a bonus solved since: where the time would have stood.
  const rows = useMemo<RankedDailyEntry[] | null>(() => {
    if (!past || shown === null || myEntry || !user || typeof solvedSeconds !== "number") return shown;
    return withUnpostedTime(shown, { userId: user.id, displayName: game.displayName, mode: "solo", seconds: solvedSeconds });
  }, [past, shown, myEntry, user, solvedSeconds, game.displayName]);
  const wouldBe = past && !myEntry ? rows?.find((e) => e.unposted) ?? null : null;
  const myRank = myEntry && myEntry.rank > 0 ? myEntry.rank : null;

  const plus = !!account?.plus;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const play = async () => {
    if (!card) return;
    if (!plus) {
      account?.openPaywall({ placement: "bonus-board", feature: "bonus", returnTo: leaderboardPath("bonus", past ? day : null) });
      return;
    }
    setBusy(true);
    setFailed(false);
    const puzzle = await loadBonusPuzzle(card.day);
    if (!puzzle) {
      setBusy(false);
      setFailed(true);
      return;
    }
    track("bonus_started", { day: card.day, from: "board" });
    if ((await game.handleSoloPuzzleLoaded(puzzle)) === false) {
      setBusy(false);
      return;
    }
    game.setSoloTheme(card.theme ?? null);
    navigate("/solo/play");
  };

  // Races, as on a daily's board (DailyLeaderboardScreen): the same reads, keyed by the card's identity.
  const ownName = useRaceName();
  const puzzleKey = card?.identity ?? null;
  const raceCandidates = useRaceCandidates(puzzleKey, true);
  const candidateIds = useMemo(() => new Set(raceCandidates.map((c) => c.userId)), [raceCandidates]);
  const racingFriends = useMemo(() => raceCandidates.filter((c) => c.friend), [raceCandidates]);
  const pitch = () => account?.openPaywall({ placement: "bonus-board", feature: "bonus", returnTo: leaderboardPath("bonus", past ? day : null) });
  const raceRow = (userId: string) => {
    if (!puzzleKey || !account) return;
    if (!plus) {
      pitch();
      return;
    }
    saveRaceIntent({ key: puzzleKey, userIds: [userId] });
    track("leaderboard_race", { slot: "bonus", past });
    void play();
  };
  const [watching, setWatching] = useState<{ puzzle: Puzzle; solves: ReplaySolve[] } | null>(null);
  const watchRow = async (userId: string) => {
    if (!card || !puzzleKey || !account) return;
    if (!plus) {
      account.openPaywall({ placement: "leaderboard_watch", feature: "race" });
      return;
    }
    try {
      const [board, theirs, mine] = await Promise.all([loadBonusPuzzle(card.day), fetchSolveTrace(userId, puzzleKey), user ? fetchOwnSolveTrace(user.id, puzzleKey).catch(() => null) : null]);
      if (!board || !theirs || theirs.events.length === 0) return;
      const them: ReplaySolve = { name: rows?.find((e) => e.userId === userId)?.displayName ?? "", color: GHOST_COLORS[0], seconds: theirs.seconds, events: theirs.events };
      const me: ReplaySolve | null = mine && mine.events.length > 0 ? { name: ownName, color: RACE_SELF_COLOR, seconds: mine.seconds, events: mine.events } : null;
      setWatching({ puzzle: board, solves: me ? [me, them] : [them] });
      track("replay_watched", { racing: !!me, placement: "leaderboard" });
    } catch (err) {
      console.warn("Leaderboard replay:", err);
    }
  };
  const [theRace, setTheRace] = useState<{ puzzle: Puzzle; solves: RaceSolve[]; letters: boolean } | null>(null);
  const [raceLoading, setRaceLoading] = useState(false);
  const openTheRace = async () => {
    if (!card || !puzzleKey || !user || raceLoading) return;
    setRaceLoading(true);
    try {
      // Without Plus: the card's shape and squares only, never the puzzle.
      const [board, found] = await Promise.all([plus ? loadBonusPuzzle(card.day) : shapePuzzle(card), loadViewerRace(user.id, puzzleKey, solvedSeconds, ownName, !plus)]);
      if (!board || !found) return;
      setTheRace({ puzzle: board, solves: found.solves, letters: found.letters });
      track("friend_race_opened", { slot: "bonus", past, racers: found.solves.length, own: found.own });
    } catch (err) {
      console.warn("The race:", err);
    } finally {
      setRaceLoading(false);
    }
  };

  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00`));

  return (
    <PageShell width="md" widthMd="5xl" bar={{ backLabel: t("completion.backToMenu") }}>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:mt-6">
        <div className="text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
            <Trophy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {t("bonus.boardTitle")}
            <PlusBadge interactive={false} size="0.8em" />
          </h1>
          {card && <p className="mt-1.5 truncate text-sm text-muted">{card.theme ? `${card.title} · ${card.theme}` : card.title}</p>}
          {streak > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 text-sm font-semibold text-gold-700 ring-1 ring-gold-100">
              <Flame className="size-4" aria-hidden="true" />
              {t("soloStats.streakDays", { count: streak })}
            </p>
          )}
        </div>

        <BoardTabs active="bonus" day={past ? day : null} />

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <div data-testid="board-day" className="flex items-center gap-1">
          <button type="button" className={STEP_BUTTON} onClick={() => previous && goToDay(previous.day)} disabled={!previous} aria-label={t("leaderboard.previousDay")}>
            <ChevronLeft className="size-5" aria-hidden="true" />
          </button>
          <p className="min-w-32 text-center text-sm font-semibold text-ink tabular-nums" aria-live="polite">
            {past ? dayLabel : t("leaderboard.today")}
          </p>
          <button type="button" className={STEP_BUTTON} onClick={() => next && goToDay(next.day)} disabled={!next} aria-label={t("leaderboard.nextDay")}>
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

        <Card className="overflow-hidden" data-testid="board-bonus">
          {!supabase ? (
            <BoardMessage icon={<WifiOff className="size-5" aria-hidden="true" />}>{t("leaderboard.offline")}</BoardMessage>
          ) : cards !== null && !card ? (
            <BoardMessage icon={<Trophy className="size-5" aria-hidden="true" />}>{t("bonus.boardNone")}</BoardMessage>
          ) : rows === null ? (
            <div role="status">
              <BoardMessage icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>{t("leaderboard.loading")}</BoardMessage>
            </div>
          ) : rows.length === 0 ? (
            <BoardMessage icon={<Trophy className="size-5" aria-hidden="true" />}>{t(only ? "leaderboard.emptyFriends" : past ? "leaderboard.emptyPast" : "bonus.boardEmpty")}</BoardMessage>
          ) : (
            <BoardTable
              rows={rows}
              userId={user?.id}
              raceable={solved ? undefined : candidateIds}
              onRace={raceRow}
              watchable={solved ? candidateIds : undefined}
              onWatch={(userId) => void watchRow(userId)}
            />
          )}
        </Card>

        {card && racingFriends.length > 0 && (
          <Button size="lg" variant="secondary" block onClick={() => void openTheRace()} disabled={raceLoading} data-testid="the-race">
            {raceLoading ? <Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Flag className="size-4.5" aria-hidden="true" />}
            {t(solved ? "friendRace.openYours" : "friendRace.open", { count: racingFriends.length, name: racingFriends[0].username })}
          </Button>
        )}

        {pending && !boardPostsHere() && (
          <p data-testid="board-not-posted" className="text-center text-xs text-muted">
            {t("leaderboard.notPosted")}
          </p>
        )}

        {card &&
          (solved ? (
            <p
              data-testid="solved-line"
              className="flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-center text-sm font-semibold text-brand-700 ring-1 ring-brand-100 tabular-nums"
            >
              <Check className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {wouldBe
                  ? t("leaderboard.wouldHavePlaced", { time: formatDuration(solvedSeconds), rank: wouldBe.rank, total: rows?.length ?? 1 })
                  : `${t("leaderboard.solvedIn", { time: formatDuration(solvedSeconds) })}${myRank !== null ? ` · ${t(past ? "leaderboard.rankThatDay" : "leaderboard.rankToday", { rank: myRank })}` : ""}`}
              </span>
            </p>
          ) : (
            account?.plusReady && (
              <div className="grid gap-2">
                <Button size="lg" block onClick={() => void play()} disabled={busy} aria-busy={busy || undefined}>
                  {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : !plus && <Lock className="size-4" aria-hidden="true" />}
                  {plus ? t(past ? "leaderboard.playThatDay" : "bonus.boardPlay") : t("bonus.playWithPlus")}
                </Button>
                {!plus && <p className="text-center text-xs text-muted">{t("bonus.boardPitch")}</p>}
                {failed && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
                    {t("bonus.loadFailed")}
                  </p>
                )}
              </div>
            )
          ))}
      </div>
      {theRace && card && (
        <FriendRaceDialog
          puzzle={theRace.puzzle}
          solves={theRace.solves}
          letters={theRace.letters}
          shareRef={{ bonusDay: card.day }}
          cta={plus || solved ? undefined : { label: t("challenge.solveYourself"), onClick: pitch }}
          onClose={() => setTheRace(null)}
        />
      )}
      {watching && <ReplayDialog puzzle={watching.puzzle} solves={watching.solves} onClose={() => setWatching(null)} />}
    </PageShell>
  );
}
