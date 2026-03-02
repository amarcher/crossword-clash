import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../../components/Title";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useHostContext } from "../../layouts/HostLayout";

export function HostMenuScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useHostContext();

  // Auto-advance to import once authenticated
  useEffect(() => {
    if (user) navigate("/host/import", { replace: true });
  }, [user, navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8">
      <Title variant="dark" className="mb-2" />
      <p className="text-neutral-400 mb-8">{t('hostView.tvHostView')}</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {user ? (
          <button
            onClick={() => navigate("/host/import")}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            {t('puzzleReady.hostGame')}
          </button>
        ) : (
          <p className="text-neutral-500 text-center text-sm">
            {t('puzzleReady.connecting')}
          </p>
        )}
      </div>
      <div className="mt-6">
        <LanguageSwitcher />
      </div>
    </div>
  );
}
