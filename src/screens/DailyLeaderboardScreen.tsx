import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, Flame, Loader2, Swords, Trophy, WifiOff } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { BoardSignForm } from "../components/BoardSignForm";
import { Button, Card } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useDailyPuzzle } from "../hooks/useDailyMini";
import { isDailySlot, type DailySlot } from "../lib/dailyFeed";
import {
  fetchDailyLeaderboard,
  mergeOwnResult,
  pendingResultFor,
  todayKey,
  updateDailyDisplayName,
  type RankedDailyEntry,
} from "../lib/dailyLeaderboard";
import { isRealPlayerName, savePlayerName } from "../lib/playerName";
import { formatDuration, puzzleIdentity } from "../lib/soloStats";
import { useBestTimes, useStreaks } from "../hooks/useSolveHistory";
import { supabase } from "../lib/supabaseClient";
import { track } from "../lib/analytics";
import { pickerPath } from "./PuzzlePickerScreen";

/** Medal treatment for the podium, all in gold tokens (gold -> pale gold). */
const MEDAL: Record<number, string> = {
  1: "bg-gold-400 text-ink shadow-[0_1px_0_rgb(255_255_255/0.5)_inset]",
  2: "bg-gold-100 text-gold-700 ring-1 ring-gold-400/50",
  3: "bg-gold-50 text-gold-700 ring-1 ring-gold-100",
};

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
 * Cross-day leaderboard for one daily slot — /daily/leaderboard for the mini,
 * /daily/leaderboard/large for the large: today's fastest solves (solo +
 * live races), the viewer's own row highlighted, and their local streak.
 * Offline (no Supabase env) it degrades to the streak + a friendly note —
 * the solo path never breaks.
 *
 * A finish made just before arriving is held in GameContext: the first fetch
 * waits for that submission to land (so the first finisher of the day never
 * sees an empty board), the viewer's own row shows at once, and the board
 * refetches whenever the tab comes back (navigation audit §3, item 9).
 */
export function DailyLeaderboardScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();
  const params = useParams();
  const slot: DailySlot = isDailySlot(params.slot) ? params.slot : "mini";

  // Undefined while the feed answers; null when there is no large today, in
  // which case the board still shows but there is nothing to play.
  const daily = useDailyPuzzle(slot);
  const { daily: streak } = useStreaks();
  const bestTimes = useBestTimes();

  const day = todayKey();
  const pending = pendingResultFor(game.pendingDailyResult, day, slot);
  const own = pending?.entry ?? null;

  // null = loading; [] = loaded empty.
  const [entries, setEntries] = useState<RankedDailyEntry[] | null>(
    supabase ? null : [],
  );

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    track("leaderboard_viewed", { day, slot });
    const load = async () => {
      // A finish posted from this tab lands before the board is read.
      if (pending) await pending.settled;
      const rows = await fetchDailyLeaderboard(day, slot);
      if (alive) setEntries(mergeOwnResult(rows, pending?.entry));
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
    // `pending` is replaced only by a new finish; its name edits are merged below.
  }, [slot, day, pending]);

  // While the server answers, the viewer's own finish is already a row
  // (rank unknown yet, drawn as "–").
  const shown = useMemo<RankedDailyEntry[] | null>(() => {
    if (entries !== null) return own ? mergeOwnResult(entries, own) : entries;
    return own ? [{ ...own, rank: 0 }] : null;
  }, [entries, own]);
  const loading = supabase !== null && entries === null;

  // The viewer's own row still carrying the anonymous default → offer the
  // one-field rename under the table (catches anyone who dismissed the
  // completion-modal prompt).
  const myEntry = shown?.find((e) => e.userId === user?.id);
  const needsName = !!myEntry && !isRealPlayerName(myEntry.displayName);
  const [signedAs, setSignedAs] = useState<string | null>(null);
  const saveName = useCallback(
    (trimmed: string) => {
      if (!trimmed || !user) return;
      game.setDisplayName(trimmed);
      savePlayerName(trimmed);
      void updateDailyDisplayName(day, user.id, trimmed, slot);
      setSignedAs(trimmed);
      // Reflect immediately, in the fetched rows and in the pending finish.
      setEntries((prev) =>
        prev?.map((e) => (e.userId === user.id ? { ...e, displayName: trimmed } : e)) ?? prev,
      );
      game.setPendingDailyResult((prev) => (prev ? { ...prev, entry: { ...prev.entry, displayName: trimmed } } : prev));
    },
    [user, game, day, slot],
  );

  // Solved today's slot: the finish just made, the board's own row, or a best
  // time on record for this puzzle (local stats or the account's history).
  const identity = daily ? puzzleIdentity(daily.puzzle) : null;
  const solvedSeconds = myEntry?.seconds ?? own?.seconds ?? (identity ? bestTimes[identity] : undefined);
  const solved = typeof solvedSeconds === "number";
  const myRank = myEntry && myEntry.rank > 0 ? myEntry.rank : null;

  const playToday = useCallback(async () => {
    track("mode_selected", { mode: "daily", slot });
    if (!daily) return;
    await game.handleSoloPuzzleLoaded(daily.puzzle);
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

  return (
    <PageShell width="md" bar={{ backLabel: t("completion.backToMenu") }}>
      <div className="mt-4 grid gap-4 sm:mt-6">
        <div className="text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
            <Trophy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            {t(slot === "large" ? "leaderboard.titleLarge" : slot === "midi" ? "leaderboard.titleMidi" : "leaderboard.title")}
          </h1>
          {daily?.theme && (
            <p className="mt-1.5 text-sm text-muted">{t("menu.dailyMiniTheme", { theme: daily.theme })}</p>
          )}
          {streak > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 text-sm font-semibold text-gold-700 ring-1 ring-gold-100">
              <Flame className="size-4 text-gold-500" aria-hidden="true" />
              {t("soloStats.streakDays", { count: streak })}
            </p>
          )}
        </div>

        <Card className="overflow-hidden" aria-busy={loading || undefined}>
          {!supabase ? (
            <BoardMessage icon={<WifiOff className="size-5" aria-hidden="true" />}>{t("leaderboard.offline")}</BoardMessage>
          ) : shown === null ? (
            <div role="status">
              <BoardMessage icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>
                {t("leaderboard.loading")}
              </BoardMessage>
            </div>
          ) : shown.length === 0 ? (
            <BoardMessage icon={<Trophy className="size-5" aria-hidden="true" />}>{t("leaderboard.empty")}</BoardMessage>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-sunken/60 text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                    <th scope="col" className="w-14 py-2.5 pl-4 pr-2 text-left">#</th>
                    <th scope="col" className="px-2 py-2.5 text-left">{t("completion.player")}</th>
                    <th scope="col" className="py-2.5 pl-2 pr-4 text-right">{t("leaderboard.time")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shown.map((e) => {
                    const isMe = user?.id === e.userId;
                    return (
                      <tr
                        key={e.userId}
                        className={isMe ? "bg-brand-50 font-semibold text-ink" : "text-ink-soft"}
                      >
                        <td className="py-2.5 pl-4 pr-2">
                          <span
                            className={`grid size-8 place-items-center rounded-full text-sm font-bold tabular-nums ${
                              MEDAL[e.rank] ?? "text-muted"
                            }`}
                          >
                            {e.rank > 0 ? e.rank : "–"}
                          </span>
                        </td>
                        <td className="max-w-0 px-2 py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{e.displayName}</span>
                            {isMe && (
                              <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                {t("leaderboard.you")}
                              </span>
                            )}
                            <span
                              className={`hidden shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide min-[380px]:inline ${
                                e.mode === "race" ? "bg-brand-50 text-brand-700" : "bg-surface-sunken text-muted"
                              }`}
                            >
                              {e.mode === "race" ? t("leaderboard.modeRace") : t("leaderboard.modeSolo")}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pl-2 pr-4 text-right font-mono tabular-nums">{formatDuration(e.seconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {loading && (
                <p role="status" className="flex items-center justify-center gap-2 border-t border-line px-4 py-2.5 text-center text-xs text-muted">
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  {t("leaderboard.posting")}
                </p>
              )}
            </>
          )}
        </Card>

        {(needsName || signedAs) && myEntry && (
          <BoardSignForm currentName={myEntry.displayName} signedAs={signedAs} onSign={saveName} />
        )}

        {daily !== null && (
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
                {t(slot === "large" ? "leaderboard.playTodayLarge" : slot === "midi" ? "leaderboard.playTodayMidi" : "leaderboard.playToday")}
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
      </div>
    </PageShell>
  );
}
