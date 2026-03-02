import { useTranslation } from "react-i18next";
import { Title } from "../components/Title";
import { useRejoinEffect } from "../layouts/RootLayout";

export function RejoinScreen() {
  const { t } = useTranslation();

  // This effect handles the actual rejoin logic and navigates away on completion
  useRejoinEffect();

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8">
      <Title className="mb-4" />
      <p className="text-neutral-500">{t('playing.reconnecting')}</p>
    </div>
  );
}
