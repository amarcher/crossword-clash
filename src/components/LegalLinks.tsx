import { TransitionLink } from "./ui/TransitionLink";
import { useTranslation } from "react-i18next";
import { openConsentSettings } from "../lib/consentStore";

/** Small Privacy / Terms / Cookie settings footer for the menu and join screens. */
export function LegalLinks({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const link =
    "inline-flex items-center min-h-11 px-2 rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500";
  return (
    <nav
      aria-label={t("legal.footerLabel")}
      className={`flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted ${className}`}
    >
      <TransitionLink to="/privacy" className={link}>
        {t("legal.privacy")}
      </TransitionLink>
      <span aria-hidden="true">·</span>
      <TransitionLink to="/terms" className={link}>
        {t("legal.terms")}
      </TransitionLink>
      <span aria-hidden="true">·</span>
      <TransitionLink to="/support" className={link}>
        {t("legal.support")}
      </TransitionLink>
      {/* The native apps have no analytics or ad cookies to configure. */}
      {import.meta.env.MODE !== "mobile" && (
        <>
          <span aria-hidden="true">·</span>
          <button type="button" onClick={openConsentSettings} className={link}>
            {t("consent.settings")}
          </button>
        </>
      )}
    </nav>
  );
}
