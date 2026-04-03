import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Title } from "../components/Title";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AdSlot } from "../components/AdSlot";
import { useAuth } from "../contexts/AuthContext";

export function MenuScreen() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center h-dvh crossword-bg p-8">
      <Title className="mb-8" />
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {(user || loading) && (
          <>
            <Link
              to="/join"
              aria-disabled={loading}
              className={`px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 transition-colors text-center ${loading ? "opacity-50 pointer-events-none" : "hover:bg-blue-700"}`}
            >
              {t('menu.joinGame')}
            </Link>
            <Link
              to="/host-game/name"
              aria-disabled={loading}
              className={`px-6 py-3 rounded-lg font-semibold text-blue-600 bg-white border-2 border-blue-600 transition-colors text-center ${loading ? "opacity-50 pointer-events-none" : "hover:bg-blue-50"}`}
            >
              {t('menu.hostAsPlayer')}
            </Link>
            <Link
              to="/host"
              aria-disabled={loading}
              className={`px-6 py-3 rounded-lg font-semibold text-blue-600 bg-white border-2 border-blue-600 transition-colors text-center ${loading ? "opacity-50 pointer-events-none" : "hover:bg-blue-50"}`}
            >
              {t('menu.hostAsTV')}
            </Link>
          </>
        )}
        <Link
          to="/solo/import"
          className="px-6 py-3 rounded-lg font-semibold text-neutral-600 bg-white border-2 border-neutral-300 hover:bg-neutral-100 transition-colors text-center"
        >
          {t('menu.playSolo')}
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
