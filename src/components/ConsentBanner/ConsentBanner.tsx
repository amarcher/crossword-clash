import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Cookie, X } from "lucide-react";
import { buttonClass } from "../ui";
import {
  closeConsentSettings,
  detectConsentRequirement,
  saveConsent,
  useConsent,
} from "../../lib/consentStore";

/**
 * Cookie consent for EEA/UK/CH visitors (and anyone who opens Cookie settings).
 * Non-modal: it never blocks the game or steals focus. Accept and Reject are
 * styled identically so refusing is as easy as agreeing.
 *
 * Rendered outside the router (see main.tsx), so links are plain anchors.
 */
export function ConsentBanner() {
  const { t } = useTranslation();
  const consent = useConsent();
  const disabled = import.meta.env.MODE === "mobile";
  const titleId = useId();

  useEffect(() => {
    if (!disabled) void detectConsentRequirement();
  }, [disabled]);

  const visible = !disabled && (consent.status === "pending" || consent.settingsOpen);
  if (!visible) return null;

  return (
    <ConsentCard
      // Remount when reopened so the toggles start from the saved choice.
      key={consent.settingsOpen ? "settings" : "banner"}
      titleId={titleId}
      startExpanded={consent.settingsOpen}
      initialAnalytics={consent.choice?.analytics ?? false}
      initialAds={consent.choice?.ads ?? false}
      dismissible={consent.status === "decided"}
      t={t}
    />
  );
}

interface CardProps {
  titleId: string;
  startExpanded: boolean;
  initialAnalytics: boolean;
  initialAds: boolean;
  dismissible: boolean;
  t: ReturnType<typeof useTranslation>["t"];
}

function ConsentCard({ titleId, startExpanded, initialAnalytics, initialAds, dismissible, t }: CardProps) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [ads, setAds] = useState(initialAds);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <section
        role="region"
        aria-labelledby={titleId}
        className="consent-enter pointer-events-auto mx-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-5 shadow-overlay"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700">
            <Cookie className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug text-ink">
              {t("consent.title")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              {t("consent.body")}{" "}
              <a href="/privacy" className="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
                {t("consent.privacyLink")}
              </a>
            </p>
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={closeConsentSettings}
              aria-label={t("consent.close")}
              className={buttonClass("ghost", "sm", "-mr-2 -mt-1 size-11 p-0")}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {expanded && (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            <ConsentToggle label={t("consent.necessary")} hint={t("consent.necessaryHint")} checked disabled />
            <ConsentToggle label={t("consent.analytics")} hint={t("consent.analyticsHint")} checked={analytics} onChange={setAnalytics} />
            <ConsentToggle label={t("consent.ads")} hint={t("consent.adsHint")} checked={ads} onChange={setAds} />
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => saveConsent(false, false)} className={buttonClass("secondary", "md", "flex-1")}>
            {t("consent.rejectAll")}
          </button>
          <button type="button" onClick={() => saveConsent(true, true)} className={buttonClass("secondary", "md", "flex-1")}>
            {t("consent.acceptAll")}
          </button>
          {expanded ? (
            <button type="button" onClick={() => saveConsent(analytics, ads)} className={buttonClass("primary", "md", "basis-full")}>
              {t("consent.save")}
            </button>
          ) : (
            <button type="button" onClick={() => setExpanded(true)} className={buttonClass("ghost", "md", "basis-full sm:basis-auto")}>
              {t("consent.customize")}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ConsentToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <label htmlFor={id} className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60 ${
          checked ? "bg-brand-600" : "bg-line-strong"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </li>
  );
}
