import { useTranslation } from "react-i18next";
import { Archive, Check, Mic, PencilRuler, RefreshCw } from "lucide-react";
import { annualSavingPercent, formatUsd, PLUS_ANNUAL_USD, PLUS_MONTHLY_USD } from "../../lib/plus";
import { useStorePrices } from "../../hooks/useStorePrices";

/**
 * What Plus is, in one card: the four benefits and the two prices (annual
 * first, the one to push). Shared by the account sheet's Plus view and every
 * gate's upsell (archive, studio, narrator). The purchase controls themselves
 * come from the caller: the web and the apps buy differently. A subscriber
 * gets the benefits without the plan tiles (`prices={false}`): the
 * entitlement row records no plan, so a highlighted tile would be a guess,
 * and switching plans is the billing portal's job.
 */
export function PlusPitch({ children, prices = true }: { children?: React.ReactNode; prices?: boolean }) {
  const { t, i18n } = useTranslation();
  // In the apps, show what the store will charge (local currency) rather than the USD list price.
  const store = useStorePrices();
  const annual = store.find((p) => p.plan === "annual");
  const monthly = store.find((p) => p.plan === "monthly");
  const fromStore = !!annual && !!monthly;
  const annualLabel = fromStore ? annual.priceString : formatUsd(PLUS_ANNUAL_USD, i18n.language);
  const monthlyLabel = fromStore ? monthly.priceString : formatUsd(PLUS_MONTHLY_USD, i18n.language);
  const saving = fromStore && monthly.price > 0 ? annualSavingPercent(monthly.price, annual.price) : annualSavingPercent();
  const benefits = [
    { icon: Archive, text: t("plus.benefitArchive") },
    { icon: PencilRuler, text: t("plus.benefitStudio") },
    { icon: Mic, text: t("plus.benefitNarrator") },
    { icon: RefreshCw, text: t("plus.benefitProgress") },
  ];
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2.5">
        {benefits.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-sm leading-snug text-ink">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="pt-1">{text}</span>
          </li>
        ))}
      </ul>
      {prices && (
      <dl className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100">
          <dt className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
            <Check className="size-3.5" aria-hidden="true" />
            {t("plus.annualSave", { percent: saving })}
          </dt>
          <dd className="mt-1 font-display text-lg font-bold leading-none text-ink">{annualLabel}</dd>
          <dd className="mt-1 text-xs text-muted">{t("plus.perYear")}</dd>
        </div>
        <div className="rounded-xl bg-surface-sunken p-3 ring-1 ring-line">
          <dt className="text-xs font-semibold text-ink-soft">{t("plus.monthly")}</dt>
          <dd className="mt-1 font-display text-lg font-bold leading-none text-ink">{monthlyLabel}</dd>
          <dd className="mt-1 text-xs text-muted">{t("plus.perMonth")}</dd>
        </div>
      </dl>
      )}
      {children}
    </div>
  );
}
