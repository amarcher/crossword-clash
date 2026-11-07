import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useGame } from "../contexts/GameContext";
import { Button } from "./ui";

export function SoloSaveNotice() {
  const { soloSaveError, isComplete } = useGame();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  if (!soloSaveError || pathname === "/menu" || pathname === "/" || (pathname === "/solo/play" && !isComplete)) return null;
  return <div role="alert" className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-md rounded-2xl bg-surface p-4 shadow-overlay ring-1 ring-line">
    <p className="text-sm text-ink">{t(soloSaveError === "capacity" ? "soloPause.capacity" : "soloPause.saveError")}</p>
    <Button className="mt-3" variant="secondary" onClick={() => navigate("/menu")}>{t("completion.backToMenu")}</Button>
  </div>;
}
