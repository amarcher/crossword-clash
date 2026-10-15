import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS } from "../i18n/i18n";
import type { SupportedLang } from "../i18n/i18n";
import { track } from "../lib/analytics";
import { Select } from "./ui";

const LANG_LABELS: Record<SupportedLang, string> = {
  en: "English",
  es: "Espa\u00f1ol",
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <Select
      value={(SUPPORTED_LANGS as readonly string[]).includes(i18n.language) ? (i18n.language as SupportedLang) : "en"}
      options={SUPPORTED_LANGS.map((lang) => ({ value: lang, label: LANG_LABELS[lang] }))}
      onChange={(lang) => {
        track("language_changed", { lang });
        i18n.changeLanguage(lang);
      }}
      aria-label={t('languageSwitcher.label')}
      className="text-muted md:min-h-9"
    />
  );
}
