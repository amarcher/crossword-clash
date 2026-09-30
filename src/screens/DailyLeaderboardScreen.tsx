import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Flame, Loader2, Swords, Trophy, WifiOff } from "lucide-react";
import { SiteBar } from "../components/SiteBar";
import { Button, Card } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { getDailyMini } from "../lib/dailyMinis";
import {
  fetchDailyLeaderboard,
  todayKey,
  updateDailyDisplayName,
  type RankedDailyEntry,
} from "../lib/dailyLeaderboard";
import { isRealPlayerName, savePlayerName, MAX_PLAYER_NAME_LENGTH } from "../lib/playerName";
import { formatDuration, getDisplayStreak } from "../lib/soloStats";
import { supabase } from "../lib/supabaseClient";
import { track } from "../lib/analytics";

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
 * Cross-day leaderboard for the daily mini: today's fastest solves (solo +
 * live races), the viewer's own row highlighted, and their local streak.
 * Offline (no Supabase env) it degrades to the streak + a friendly note —
 * the solo path never breaks.
 */
export function DailyLeaderboardScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const game = useGame();

  const dailyMini = useMemo(() => getDailyMini(), []);
  const streak = useMemo(() => getDisplayStreak(), []);

  // null = loading; [] = loaded empty.
  const [entries, setEntries] = useState<RankedDailyEntry[] | null>(
    supabase ? null : [],
  );

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    track("leaderboard_viewed", { day: todayKey() });
    fetchDailyLeaderboard(todayKey()).then((rows) => {
      if (alive) setEntries(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  // The viewer's own row still carrying the anonymous default → offer a
  // one-field rename right under the table (catches anyone who dismissed the
  // completion-modal prompt).
  const myEntry = entries?.find((e) => e.userId === user?.id);
  const needsName = !!myEntry && !isRealPlayerName(myEntry.displayName);
  const [nameDraft, setNameDraft] = useState("");
  const saveName = useCallback(() => {
    const trimmed = nameDraft.trim();
    if (!trimmed || !user) return;
    game.setDisplayName(trimmed);
    savePlayerName(trimmed);
    void updateDailyDisplayName(todayKey(), user.id, trimmed);
    // Reflect immediately — the board was already fetched.
    setEntries((prev) =>
      prev?.map((e) => (e.userId === user.id ? { ...e, displayName: trimmed } : e)) ?? prev,
    );
  }, [nameDraft, user, game]);

  const playToday = useCallback(async () => {
    track("mode_selected", { mode: "daily" });
    await game.handleSoloPuzzleLoaded(dailyMini.puzzle);
    game.setSoloTheme(dailyMini.theme);
    navigate("/solo/play");
  }, [game, dailyMini, navigate]);

  const raceFriends = useCallback(() => {
    track("mode_selected", { mode: "daily-race" });
    // Hand the bundled daily to the existing host flow (name → lobby) — the
    // same mechanic used for imported puzzles, no import step.
    game.setUrlPuzzle(dailyMini.puzzle);
    navigate("/host-game/name");
  }, [game, dailyMini, navigate]);

  return (
    <div className="min-h-dvh crossword-bg px-4 pb-10 pt-2">
      <SiteBar backLabel={t("completion.backToMenu")} />

      <div className="mx-auto mt-4 grid w-full max-w-md gap-4 sm:mt-6">
        <div className="text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
            <Trophy className="size-6" aria-hidden="true" />
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{t("leaderboard.title")}</h1>
          <p className="mt-1.5 text-sm text-muted">{t("menu.dailyMiniTheme", { theme: dailyMini.theme })}</p>
          {streak > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 text-sm font-semibold text-gold-700 ring-1 ring-gold-100">
              <Flame className="size-4 text-gold-500" aria-hidden="true" />
              {t("soloStats.streakDays", { count: streak })}
            </p>
          )}
        </div>

        <Card className="overflow-hidden">
          {!supabase ? (
            <BoardMessage icon={<WifiOff className="size-5" aria-hidden="true" />}>{t("leaderboard.offline")}</BoardMessage>
          ) : entries === null ? (
            <div role="status">
              <BoardMessage icon={<Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />}>
                {t("leaderboard.loading")}
              </BoardMessage>
            </div>
          ) : entries.length === 0 ? (
            <BoardMessage icon={<Trophy className="size-5" aria-hidden="true" />}>{t("leaderboard.empty")}</BoardMessage>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-sunken/60 text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
                  <th scope="col" className="w-14 py-2.5 pl-4 pr-2 text-left">#</th>
                  <th scope="col" className="px-2 py-2.5 text-left">{t("completion.player")}</th>
                  <th scope="col" className="py-2.5 pl-2 pr-4 text-right">{t("leaderboard.time")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entries.map((e) => {
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
                          {e.rank}
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
          )}
        </Card>

        {needsName && (
          <Card className="border-gold-100 bg-gold-50/60 p-4">
            <p className="mb-3 flex items-center justify-center gap-2 text-center text-sm font-semibold text-gold-700">
              <Trophy className="size-4 shrink-0" aria-hidden="true" />
              {t("leaderboard.signPrompt", { name: myEntry.displayName })}
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                }}
                placeholder={t("leaderboard.signPlaceholder")}
                aria-label={t("leaderboard.signPlaceholder")}
                maxLength={MAX_PLAYER_NAME_LENGTH}
                autoComplete="nickname"
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-center text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 md:text-sm"
              />
              <Button onClick={saveName} disabled={!nameDraft.trim()}>
                {t("leaderboard.signSave")}
              </Button>
            </div>
          </Card>
        )}

        <div className="grid gap-2.5">
          <Button size="lg" block onClick={playToday}>
            {t("leaderboard.playToday")}
          </Button>
          {user && (
            <Button size="lg" variant="secondary" block onClick={raceFriends}>
              <Swords className="size-4.5" aria-hidden="true" />
              {t("leaderboard.raceFriends")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
