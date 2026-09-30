import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS } from "../i18n/i18n";
import type { SupportedLang } from "../i18n/i18n";
import { track } from "../lib/analytics";

const LANG_LABELS: Record<SupportedLang, string> = {
  en: "English",
  es: "Espa\u00f1ol",
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <select
      value={i18n.language}
      onChange={(e) => {
        track("language_changed", { lang: e.target.value });
        i18n.changeLanguage(e.target.value);
      }}
      aria-label={t('languageSwitcher.label')}
      className="min-h-11 cursor-pointer rounded-lg border border-line bg-surface px-2.5 text-base text-muted md:min-h-9 md:text-sm focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      {SUPPORTED_LANGS.map((lang) => (
        <option key={lang} value={lang}>
          {LANG_LABELS[lang]}
        </option>
      ))}
    </select>
  );
}
