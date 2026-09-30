import { useEffect } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { LEGAL_CONTENT, LEGAL_LAST_UPDATED, type LegalDoc } from "./legalContent";

interface LegalPageProps {
  kind: "privacy" | "terms";
}

export function LegalPage({ kind }: LegalPageProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith("es") ? "es" : "en";
  const doc: LegalDoc = LEGAL_CONTENT[lang][kind];
  const title = kind === "privacy" ? t("legal.privacyTitle") : t("legal.termsTitle");

  useEffect(() => {
    const previous = document.title;
    document.title = `${title} | Crossword Clash`;
    return () => {
      document.title = previous;
    };
  }, [title]);

  return (
    <main
      className="min-h-dvh crossword-bg px-4 py-8"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        paddingBottom: "max(2rem, env(safe-area-inset-bottom))",
      }}
    >
      <article className="mx-auto w-full max-w-2xl rounded-2xl bg-white border border-neutral-200 shadow-sm p-5 sm:p-8 text-neutral-700 leading-relaxed">
        <div className="flex items-center justify-between gap-3 mb-4">
          <Link
            to="/"
            className="inline-flex items-center min-h-11 text-sm text-blue-700 underline underline-offset-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t("legal.back")}
          </Link>
          <LanguageSwitcher />
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
        <p className="text-sm text-neutral-500 mt-1 mb-4">
          {t("legal.lastUpdated", { date: LEGAL_LAST_UPDATED })}
        </p>
        <p className="mb-6">{doc.intro}</p>
        {doc.sections.map((section) => (
          <section key={section.heading} className="mb-6">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className="mb-3 break-words">
                {p}
              </p>
            ))}
            {section.items && (
              <ul className="list-disc pl-5 space-y-2 mb-3">
                {section.items.map((item) => (
                  <li key={item} className="break-words">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
        <nav aria-label={t("legal.footerLabel")} className="pt-4 border-t border-neutral-200 text-sm flex gap-4">
          {kind === "privacy" ? (
            <Link to="/terms" className="text-blue-700 underline underline-offset-2">
              {t("legal.terms")}
            </Link>
          ) : (
            <Link to="/privacy" className="text-blue-700 underline underline-offset-2">
              {t("legal.privacy")}
            </Link>
          )}
        </nav>
      </article>
    </main>
  );
}
