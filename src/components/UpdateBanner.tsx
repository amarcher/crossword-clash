import { useTranslation } from "react-i18next";
import { ArrowDownToLine } from "lucide-react";
import { Button } from "./ui";
import { useAppUpdate } from "../hooks/useAppUpdate";

/**
 * "Crossword Clash 1.2.0 is available" at the top of the menu in the apps,
 * with Update and a quiet Later. Renders nothing on the web, before the store
 * has answered, for the installed version, and after "Later" for the same
 * version (all decided by useAppUpdate). In flow, so it pads no safe area of
 * its own: `.native-app #root` already does.
 */
export function UpdateBanner({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const { available, version, update, dismiss } = useAppUpdate();
  if (!available) return null;
  return (
    <section
      aria-label={t("update.label")}
      className={`flex items-start gap-3.5 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100 ${className}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
        <ArrowDownToLine className="size-5" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-ink">
          {version ? t("update.available", { version }) : t("update.availableNoVersion")}
        </p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{t("update.benefit")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={update}>
            {t("update.update")}
          </Button>
          <Button size="sm" variant="ghost" onClick={dismiss}>
            {t("update.later")}
          </Button>
        </div>
      </div>
    </section>
  );
}
