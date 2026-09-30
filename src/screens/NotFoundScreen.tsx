import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { NoticeScreen, primaryButtonClass } from "./RouteErrorScreen";

export function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <NoticeScreen title={t("errors.notFoundTitle")} body={t("errors.notFoundBody")}>
      <Link to="/" className={primaryButtonClass}>
        {t("errors.backToMenu")}
      </Link>
    </NoticeScreen>
  );
}
