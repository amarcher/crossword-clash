import { useTranslation } from "react-i18next";
import { Archive, ChartLine, Flag, Flame, Grid3x3, Mic, PencilRuler } from "lucide-react";
import { formatUsd, PLUS_ANNUAL_USD, PLUS_MONTHLY_USD } from "../../lib/plus";
import { useStorePrices } from "../../hooks/useStorePrices";
import { useFreeMonth } from "../../hooks/useFreeMonth";

/**
 * What is extra in Plus, as one short list (Andrew, 2026-11-13: only what a
 * subscriber gets, no allowances, nothing a free account already has). Shared
 * by the account sheet's Plus view and every gate's upsell (archive, studio,
 * narrator). The plans and the purchase come from the caller
 * (PlusPurchaseControls): the web and the apps buy differently, and a
 * subscriber sees the list with Manage under it.
 */
export function PlusPitch({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation();
  const benefits = [
    { icon: Grid3x3, text: t("plus.benefitBonus") },
    { icon: Flag, text: t("plus.benefitRace") },
    { icon: Archive, text: t("plus.benefitArchive") },
    { icon: ChartLine, text: t("plus.benefitStats") },
    { icon: PencilRuler, text: t("plus.benefitStudio") },
    { icon: Mic, text: t("plus.benefitNarrator") },
    { icon: Flame, text: t("plus.benefitStreak") },
  ];
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col gap-2">
        {benefits.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm leading-snug text-ink">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

/**
 * The two prices in one line, for a visitor who has to sign in before the
 * plans can be offered (the plan tiles sit with the purchase button).
 */
export function PlusPriceLine() {
  const { t, i18n } = useTranslation();
  // In the apps, what the store will charge (local currency) rather than the USD list price.
  const store = useStorePrices();
  const annual = store.find((p) => p.plan === "annual")?.priceString ?? formatUsd(PLUS_ANNUAL_USD, i18n.language);
  const monthly = store.find((p) => p.plan === "monthly")?.priceString ?? formatUsd(PLUS_MONTHLY_USD, i18n.language);
  const free = useFreeMonth();
  return (
    <p className="rounded-xl bg-surface-sunken px-3 py-2.5 text-center text-sm leading-snug text-ink-soft">
      {t(free.annual && free.monthly ? "plus.priceLineFree" : "plus.priceLine", { annual, monthly })}
    </p>
  );
}
