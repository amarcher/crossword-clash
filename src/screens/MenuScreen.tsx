import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Title } from "../components/Title";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AdSlot } from "../components/AdSlot";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { track } from "../lib/analytics";
import { getDailyMini } from "../lib/dailyMinis";
import { getDisplayStreak } from "../lib/soloStats";

type GameMode = "join" | "host" | "tv" | "solo" | "import";

const ONBOARDED_KEY = "crossword-clash:onboarded";

function readOnboarded(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return true;
  }
}

interface MenuTileProps {
  to: string;
  title: string;
  subtitle: string;
  variant: "primary" | "outline";
  mode: GameMode;
  disabled?: boolean;
}

function MenuTile({ to, title, subtitle, variant, mode, disabled }: MenuTileProps) {
  const base =
    "block px-5 py-3 rounded-lg text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  const styles =
    variant === "primary"
      ? `${base} text-white bg-blue-600 ${disabled ? "opacity-50 pointer-events-none" : "hover:bg-blue-700"}`
      : `${base} text-blue-600 bg-white border-2 border-blue-600 ${disabled ? "opacity-50 pointer-events-none" : "hover:bg-blue-50"}`;
  return (
    <Link
      to={to}
      aria-disabled={disabled}
      className={styles}
      onClick={() => track("mode_selected", { mode })}
    >
      <span className="block font-semibold leading-tight">{title}</span>
      <span
        className={`block text-xs mt-0.5 ${
          variant === "primary" ? "text-blue-50/90" : "text-neutral-500"
        }`}
      >
        {subtitle}
      </span>
    </Link>
  );
}

export function MenuScreen() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();
  const disabled = loading;
  const streak = useMemo(() => getDisplayStreak(), []);

  // Resolve once per render — deterministic per calendar day.
  const dailyMini = useMemo(() => getDailyMini(), []);

  // First-visit orienting tip — shown until the visitor dismisses it once.
  const [showNudge, setShowNudge] = useState(() => !readOnboarded());
  const dismissNudge = useCallback(() => {
    setShowNudge(false);
    try {
      window.localStorage.setItem(ONBOARDED_KEY, "1");
    } catch {
      // Ignore storage failures — the tip simply reappears next visit.
    }
  }, []);

  const playDailyMini = useCallback(async () => {
    track("mode_selected", { mode: "daily" });
    // No import step: load the bundled mini straight into solo play. It carries
    // no file buffer, so handleSoloPuzzleLoaded won't count it as an import.
    await handleSoloPuzzleLoaded(dailyMini.puzzle);
    setSoloTheme(dailyMini.theme);
    navigate("/solo/play");
  }, [dailyMini, handleSoloPuzzleLoaded, setSoloTheme, navigate]);

  const raceDailyMini = useCallback(() => {
    track("mode_selected", { mode: "daily-race" });
    // Hand today's mini to the existing host flow (name → lobby with share
    // code/QR) — everyone is released into the SAME puzzle at the same instant
    // when the host starts. Same lobby mechanic as any imported puzzle.
    setUrlPuzzle(dailyMini.puzzle);
    navigate("/host-game/name");
  }, [dailyMini, setUrlPuzzle, navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh crossword-bg p-8">
      {/* The wordmark constructs via a one-shot Lottie on every menu visit. */}
      <Title animate className="mb-8" />
      {streak > 0 && (
        <div className="mb-6 -mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm font-semibold text-amber-700">
          {t("soloStats.streakDays", { count: streak })}
        </div>
      )}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {/* Front door: instant play, no import. Prominent + above the fold. */}
        {/* The daily mini is fully local (bundled data) — never gate it on
            auth loading, so a cold visitor can tap the activation CTA instantly. */}
        <button
          type="button"
          onClick={playDailyMini}
          className="group block w-full px-5 py-4 rounded-xl text-center text-white bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-blue-100">
            {t("menu.dailyMiniEyebrow")}
          </span>
          <span className="block text-lg font-bold leading-tight mt-0.5">
            {t("menu.playDailyMini")}
          </span>
          <span className="block text-xs mt-1 text-blue-50/90">
            {t("menu.dailyMiniTheme", { theme: dailyMini.theme })}
          </span>
        </button>

        {/* Daily race + leaderboard — the return loop under the front door. */}
        <div className="flex gap-2 -mt-1">
          {(user || loading) && (
            <button
              type="button"
              onClick={raceDailyMini}
              disabled={disabled}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              ⚔️ {t("menu.raceFriends")}
            </button>
          )}
          <Link
            to="/daily/leaderboard"
            onClick={() => track("mode_selected", { mode: "leaderboard" })}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-center text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            🏅 {t("menu.dailyLeaderboard")}
          </Link>
        </div>

        {showNudge && (
          <div
            role="note"
            className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-neutral-600"
          >
            <span className="flex-1 leading-snug">{t("menu.nudge")}</span>
            <button
              type="button"
              onClick={dismissNudge}
              aria-label={t("menu.nudgeDismiss")}
              title={t("menu.nudgeDismiss")}
              className="shrink-0 -mr-1 -mt-0.5 rounded p-0.5 text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
              </svg>
            </button>
          </div>
        )}

        {(user || loading) && (
          <>
            <MenuTile
              to="/join"
              title={t("menu.joinGame")}
              subtitle={t("menu.joinGameSubtitle")}
              variant="primary"
              mode="join"
              disabled={disabled}
            />
            <MenuTile
              to="/host-game/name"
              title={t("menu.hostAsPlayer")}
              subtitle={t("menu.hostAsPlayerSubtitle")}
              variant="outline"
              mode="host"
              disabled={disabled}
            />
            <MenuTile
              to="/host"
              title={t("menu.hostAsTV")}
              subtitle={t("menu.hostAsTVSubtitle")}
              variant="outline"
              mode="tv"
              disabled={disabled}
            />
          </>
        )}
        <Link
          to="/solo/import"
          onClick={() => track("mode_selected", { mode: "solo" })}
          className="block px-5 py-3 rounded-lg text-center font-semibold text-neutral-600 bg-white border-2 border-neutral-300 hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="block leading-tight">{t("menu.playSolo")}</span>
          <span className="block text-xs mt-0.5 text-neutral-400">
            {t("menu.playSoloSubtitle")}
          </span>
        </Link>
        <Link
          to="/solo/import"
          onClick={() => track("mode_selected", { mode: "import" })}
          className="px-4 py-2 rounded-lg text-sm text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 transition-colors text-center"
        >
          {t("menu.importPuzzle")}
        </Link>
      </div>
      <div className="mt-6">
        <LanguageSwitcher />
      </div>
      <div className="mt-4">
        <AdSlot placement="menu-bottom" />
      </div>
    </div>
  );
}
