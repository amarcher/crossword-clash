import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { useRejoinEffect } from "../layouts/RootLayout";
import { clearMpSession } from "../lib/sessionPersistence";

export function RejoinScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // This effect handles the actual rejoin logic and navigates away on completion
  useRejoinEffect();

  // A way out while the room is looked up (a dead network used to leave this
  // spinner forever): dropping the session keeps "/" from walking back in.
  const leave = () => {
    clearMpSession();
    navigate("/menu", { replace: true });
  };

  return (
    <div className="grid min-h-dvh place-items-center crossword-bg p-6">
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Loader2 className="size-7 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </span>
        <p className="font-display text-xl font-bold text-ink">{t('playing.reconnecting')}</p>
        <button type="button" onClick={leave} className="mt-2 inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500">
          {t("completion.backToMenu")}
        </button>
      </div>
    </div>
  );
}
