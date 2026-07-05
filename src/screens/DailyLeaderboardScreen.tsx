import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../components/Title";
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
    <div className="flex flex-col items-center min-h-dvh crossword-bg p-6 sm:p-8">
      <Title className="mb-4" />

      <div className="w-full max-w-md">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-neutral-900">
            🏅 {t("leaderboard.title")}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            {t("menu.dailyMiniTheme", { theme: dailyMini.theme })}
          </p>
          {streak > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm font-semibold text-amber-700">
              {t("soloStats.streakDays", { count: streak })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white shadow-md border border-neutral-200 overflow-hidden mb-4">
          {!supabase ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              {t("leaderboard.offline")}
            </p>
          ) : entries === null ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-400">
              {t("leaderboard.loading")}
            </p>
          ) : entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-neutral-500">
              {t("leaderboard.empty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-100">
                  <th className="text-left py-2 px-3 w-10">#</th>
                  <th className="text-left py-2 px-3">{t("completion.player")}</th>
                  <th className="text-right py-2 px-3">{t("leaderboard.time")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const isMe = user?.id === e.userId;
                  return (
                    <tr
                      key={e.userId}
                      className={
                        isMe
                          ? "bg-blue-50 text-blue-900 font-semibold"
                          : "text-neutral-600"
                      }
                    >
                      <td className="py-2 px-3 font-medium tabular-nums">{e.rank}</td>
                      <td className="py-2 px-3">
                        <span className="truncate">
                          {e.displayName}
                          {isMe && (
                            <span className="ml-1.5 text-[10px] font-bold uppercase text-blue-500">
                              {t("leaderboard.you")}
                            </span>
                          )}
                        </span>
                        <span
                          className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            e.mode === "race"
                              ? "bg-indigo-50 text-indigo-600"
                              : "bg-neutral-100 text-neutral-500"
                          }`}
                        >
                          {e.mode === "race"
                            ? t("leaderboard.modeRace")
                            : t("leaderboard.modeSolo")}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {formatDuration(e.seconds)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {needsName && (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-200 px-4 py-3 mb-4">
            <p className="text-center text-sm font-semibold text-indigo-700 mb-2">
              🏅 {t("leaderboard.signPrompt", { name: myEntry.displayName })}
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
                className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
              <button
                type="button"
                onClick={saveName}
                disabled={!nameDraft.trim()}
                className="shrink-0 px-4 py-2 rounded-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                {t("leaderboard.signSave")}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={playToday}
            className="w-full px-5 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {t("leaderboard.playToday")}
          </button>
          {user && (
            <button
              type="button"
              onClick={raceFriends}
              className="w-full px-5 py-3 rounded-lg font-semibold text-blue-600 bg-white border-2 border-blue-600 hover:bg-blue-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              ⚔️ {t("leaderboard.raceFriends")}
            </button>
          )}
          <Link
            to="/"
            className="w-full px-5 py-2.5 rounded-lg text-center text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            {t("completion.backToMenu")}
          </Link>
        </div>
      </div>
    </div>
  );
}
