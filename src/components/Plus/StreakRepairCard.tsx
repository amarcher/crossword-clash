import { useTranslation } from "react-i18next";
import { Flame } from "lucide-react";
import { Button } from "../ui";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { useRepairOffer } from "../../hooks/useSolveHistory";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { dailyPath } from "../../lib/dailyChallenge";
import { plusEnabled } from "../../lib/plus";
import { track } from "../../lib/analytics";

/**
 * The menu's "Repair your 23-day streak" (streakRepair.ts; Plus only, for the
 * one day after a single missed day). A Plus player goes straight to the
 * missed day's mini, whose finish repairs the streak; anyone else sees what
 * it would save and the pitch (`paywall_viewed { placement: "streak" }`).
 * Nothing renders without an offer or while Plus is switched off.
 */
export function StreakRepairCard() {
  const { t, i18n } = useTranslation();
  const account = useMaybeAccount();
  const offer = useRepairOffer();
  const navigate = useTransitionNavigate();
  if (!plusEnabled() || !offer || !account?.plusReady) return null;
  const weekday = new Date(`${offer.day}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "long" });
  const plus = account.plus;
  return (
    <section aria-label={t("streakRepair.title", { count: offer.streak })} className="flex items-center gap-3 rounded-2xl bg-gold-50 p-4 text-left ring-1 ring-gold-100">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-gold-700 ring-1 ring-gold-100">
        <Flame className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-ink">{t("streakRepair.title", { count: offer.streak })}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{plus ? t("streakRepair.body", { day: weekday }) : t("streakRepair.bodyFree", { day: weekday })}</p>
      </div>
      {plus ? (
        <Button
          size="sm"
          onClick={() => {
            track("streak_repair_started", { streak: offer.streak });
            navigate(dailyPath(offer.day, "mini"));
          }}
        >
          {t("streakRepair.play")}
        </Button>
      ) : (
        <Button size="sm" onClick={() => account.openPaywall({ placement: "streak", feature: "streak" })}>
          {t("streakRepair.withPlus")}
        </Button>
      )}
    </section>
  );
}
