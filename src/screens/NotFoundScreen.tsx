import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Compass } from "lucide-react";
import { NoticeScreen, primaryButtonClass } from "./RouteErrorScreen";

export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <NoticeScreen icon={Compass} title={t("errors.notFoundTitle")} body={t("errors.notFoundBody")}>
      <Link to="/" className={primaryButtonClass}>
        {t("errors.backToMenu")}
      </Link>
    </NoticeScreen>
  );
}
