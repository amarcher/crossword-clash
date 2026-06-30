import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Title } from "../components/Title";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AdSlot } from "../components/AdSlot";
import { useAuth } from "../contexts/AuthContext";
import { track } from "../lib/analytics";
import { getDisplayStreak } from "../lib/soloStats";

type GameMode = "join" | "host" | "tv" | "solo" | "import";

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
  const disabled = loading;
  const streak = useMemo(() => getDisplayStreak(), []);

  return (
    <div className="flex flex-col items-center justify-center h-dvh crossword-bg p-8">
      {/* The wordmark constructs via a one-shot Lottie on every menu visit. */}
      <Title animate className="mb-8" />
      {streak > 0 && (
        <div className="mb-6 -mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-sm font-semibold text-amber-700">
          {t("soloStats.streakDays", { count: streak })}
        </div>
      )}
      <div className="flex flex-col gap-3 w-full max-w-xs">
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
