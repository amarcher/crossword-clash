import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, Loader2, Lock, Trophy, WifiOff } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { BoardTable } from "../components/Leaderboard/BoardTable";
import { Button, Card } from "../components/ui";
import { PlusBadge } from "../components/ui/PlusBadge";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useMaybeAccount } from "../contexts/AccountContext";
import { useBestTimes } from "../hooks/useSolveHistory";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { fetchBonusCards, loadBonusPuzzle, type BonusCard } from "../lib/bonus";
import {
  boardPostsHere,
  fetchDailyLeaderboard,
  leaderboardPath,
  mergeOwnResult,
  pendingResultFor,
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
 */
export function BonusLeaderboardScreen() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const game = useGame();
  const account = useMaybeAccount();
  const navigate = useTransitionNavigate();
  const bestTimes = useBestTimes();
  const today = todayKey();

  // Released bonuses up to today, oldest first: the days the stepper walks.
  const [cards, setCards] = useState<BonusCard[] | null>(supabase ? null : []);
  useEffect(() => {
    let live = true;
    void fetchBonusCards(120).then((rows) => live && setCards(rows.filter((c) => c.day <= today).reverse()));
    return () => {
      live = false;
    };
  }, [today]);

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
  const [entries, setEntries] = useState<{ day: string; rows: RankedDailyEntry[] } | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const load = async () => {
      // A finish posted from this tab lands before the board is read.
      if (pending) await pending.settled;
      const rows = await fetchDailyLeaderboard(day, "bonus");
      if (alive) setEntries({ day, rows });
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
  }, [day, pending]);

  const loaded = !supabase ? [] : entries?.day === day ? entries.rows : null;
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

  const dayLabel = new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${day}T12:00:00`));

  return (
    <PageShell width="md" widthMd="5xl" bar={{ backLabel: t("completion.backToMenu") }}>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:mt-6">
        <div className="text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
            <Trophy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="inline-flex items-center gap-2 font-display text-3xl font-bold tracking-tight text-ink">
            {t("bonus.boardTitle")}
            <PlusBadge interactive={false} size="0.8em" />
          </h1>
          {card && <p className="mt-1.5 truncate text-sm text-muted">{card.theme ? `${card.title} · ${card.theme}` : card.title}</p>}
        </div>

        <div data-testid="board-day" className="flex items-center justify-center gap-1">
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
            <BoardMessage icon={<Trophy className="size-5" aria-hidden="true" />}>{t(past ? "leaderboard.emptyPast" : "bonus.boardEmpty")}</BoardMessage>
          ) : (
            <BoardTable rows={rows} userId={user?.id} />
          )}
        </Card>

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
                  <p role="alert" className="text-sm text-red-700">
                    {t("bonus.loadFailed")}
                  </p>
                )}
              </div>
            )
          ))}
      </div>
    </PageShell>
  );
}
