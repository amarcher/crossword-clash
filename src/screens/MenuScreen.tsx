import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Title } from "../components/Title";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AdSlot } from "../components/AdSlot";
import { useAuth } from "../contexts/AuthContext";

interface MenuTileProps {
  to: string;
  title: string;
  subtitle: string;
  variant: "primary" | "outline";
  disabled?: boolean;
}

function MenuTile({ to, title, subtitle, variant, disabled }: MenuTileProps) {
  const base =
    "block px-5 py-3 rounded-lg text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";
  const styles =
    variant === "primary"
      ? `${base} text-white bg-blue-600 ${disabled ? "opacity-50 pointer-events-none" : "hover:bg-blue-700"}`
      : `${base} text-blue-600 bg-white border-2 border-blue-600 ${disabled ? "opacity-50 pointer-events-none" : "hover:bg-blue-50"}`;
  return (
    <Link to={to} aria-disabled={disabled} className={styles}>
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

  return (
    <div className="flex flex-col items-center justify-center h-dvh crossword-bg p-8">
      <Title className="mb-8" />
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {(user || loading) && (
          <>
            <MenuTile
              to="/join"
              title={t("menu.joinGame")}
              subtitle={t("menu.joinGameSubtitle")}
              variant="primary"
              disabled={disabled}
            />
            <MenuTile
              to="/host-game/name"
              title={t("menu.hostAsPlayer")}
              subtitle={t("menu.hostAsPlayerSubtitle")}
              variant="outline"
              disabled={disabled}
            />
            <MenuTile
              to="/host"
              title={t("menu.hostAsTV")}
              subtitle={t("menu.hostAsTVSubtitle")}
              variant="outline"
              disabled={disabled}
            />
          </>
        )}
        <Link
          to="/solo/import"
          className="block px-5 py-3 rounded-lg text-center font-semibold text-neutral-600 bg-white border-2 border-neutral-300 hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span className="block leading-tight">{t("menu.playSolo")}</span>
          <span className="block text-xs mt-0.5 text-neutral-400">
            {t("menu.playSoloSubtitle")}
          </span>
        </Link>
        <Link
          to="/solo/import"
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
