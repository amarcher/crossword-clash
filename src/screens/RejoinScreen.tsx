import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useRejoinEffect } from "../layouts/RootLayout";

export function RejoinScreen() {
  const { t } = useTranslation();

  // This effect handles the actual rejoin logic and navigates away on completion
  useRejoinEffect();

  return (
    <div className="grid min-h-dvh place-items-center crossword-bg p-6">
      <div className="flex flex-col items-center gap-4 text-center" role="status">
        <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Loader2 className="size-7 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        </span>
        <p className="font-display text-xl font-bold text-ink">{t('playing.reconnecting')}</p>
      </div>
    </div>
  );
}
