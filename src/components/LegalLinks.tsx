import { Link } from "react-router";
import { useTranslation } from "react-i18next";

/** Small Privacy / Terms footer for the menu and join screens. */
export function LegalLinks({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const link =
    "inline-flex items-center min-h-11 px-2 underline underline-offset-2 hover:text-neutral-700 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
  return (
    <nav
      aria-label={t("legal.footerLabel")}
      className={`flex items-center justify-center gap-2 text-xs text-neutral-500 ${className}`}
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
