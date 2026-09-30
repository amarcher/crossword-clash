import { useEffect } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { SiteBar } from "../../components/SiteBar";
import { Card } from "../../components/ui";
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
      className="min-h-dvh crossword-bg px-4 pb-10 pt-2"
      style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}
    >
      <SiteBar backLabel={t("legal.back")} right={<LanguageSwitcher />} />
      <Card
        className="mx-auto mt-4 w-full max-w-2xl p-5 leading-relaxed text-ink-soft sm:mt-6 sm:p-8"
      >
        <article>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mb-6 mt-1.5 text-sm text-muted">
            {t("legal.lastUpdated", { date: LEGAL_LAST_UPDATED })}
          </p>
          <p className="mb-8 text-base">{doc.intro}</p>
          {doc.sections.map((section) => (
            <section key={section.heading} className="mb-7">
              <h2 className="mb-2 font-display text-lg font-semibold text-ink">{section.heading}</h2>
              {section.paragraphs?.map((p) => (
                <p key={p} className="mb-3 break-words">
                  {p}
                </p>
              ))}
              {section.items && (
                <ul className="mb-3 list-disc space-y-2 pl-5 marker:text-subtle">
                  {section.items.map((item) => (
                    <li key={item} className="break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          <nav aria-label={t("legal.footerLabel")} className="flex gap-4 border-t border-line pt-4 text-sm">
            <Link
              to={kind === "privacy" ? "/terms" : "/privacy"}
              className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-500 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              {kind === "privacy" ? t("legal.terms") : t("legal.privacy")}
            </Link>
          </nav>
        </article>
      </Card>
    </main>
  );
}
