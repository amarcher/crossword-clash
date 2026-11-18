import { useEffect } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { TVScreen, TV_QUIET_LINK } from "../../components/Layout/TVScreen";
import { TransitionLink, buttonClass } from "../../components/ui";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useHostContext } from "../../layouts/HostLayout";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";

export function HostMenuScreen() {
  const { t } = useTranslation();
  const navigate = useTransitionNavigate();
  const redirect = useNavigate();
  const { user } = useHostContext();

  // Auto-advance to import once authenticated
  useEffect(() => {
    if (user) redirect("/host/import", { replace: true });
  }, [user, redirect]);

  return (
    <TVScreen
      footer={
        <TransitionLink to="/menu" className={TV_QUIET_LINK}>
          {t("completion.backToMenu")}
        </TransitionLink>
      }
    >
      <div className="max-w-[40em]">
        <h1 className="tv-t-2xl font-display font-bold text-white">{t('hostView.tvHostView')}</h1>
        <p className="tv-t-lg mt-3 text-slate-300">{t('hostView.tvHostViewHint')}</p>
      </div>
      {user ? (
        <button onClick={() => navigate("/host/import")} className={buttonClass("primary", "lg", "tv-t-lg h-auto! px-10 py-4")}>
          {t('puzzleReady.hostGame')}
          <ArrowRight className="size-[1.1em]" aria-hidden />
        </button>
      ) : (
        <p role="status" className="tv-t-md text-slate-400">{t('puzzleReady.connecting')}</p>
      )}
      <LanguageSwitcher />
    </TVScreen>
  );
}
