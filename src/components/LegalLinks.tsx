import { Link } from "react-router";
import { useTranslation } from "react-i18next";

/** Small Privacy / Terms footer for the menu and join screens. */
export function LegalLinks({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const link =
    "inline-flex items-center min-h-11 px-2 rounded hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500";
  return (
    <nav
      aria-label={t("legal.footerLabel")}
      className={`flex items-center justify-center gap-2 text-sm text-muted ${className}`}
    >
      <Link to="/privacy" className={link}>
        {t("legal.privacy")}
      </Link>
      <span aria-hidden="true">·</span>
      <Link to="/terms" className={link}>
        {t("legal.terms")}
      </Link>
    </nav>
  );
}
