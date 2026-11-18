import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { NoticeScreen, primaryButtonClass } from "./RouteErrorScreen";
import { TransitionLink } from "../components/ui";

export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <NoticeScreen icon={Compass} title={t("errors.notFoundTitle")} body={t("errors.notFoundBody")}>
      <TransitionLink to="/menu" className={primaryButtonClass}>
        {t("errors.backToMenu")}
      </TransitionLink>
    </NoticeScreen>
  );
}
