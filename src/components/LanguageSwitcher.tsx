import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGS } from "../i18n/i18n";
import type { SupportedLang } from "../i18n/i18n";

const LANG_LABELS: Record<SupportedLang, string> = {
  en: "English",
  es: "Espa\u00f1ol",
};

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <select
      value={i18n.language}
      onChange={(e) => i18n.changeLanguage(e.target.value)}
      className="text-sm text-neutral-500 bg-transparent border border-neutral-300 rounded px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {SUPPORTED_LANGS.map((lang) => (
        <option key={lang} value={lang}>
          {LANG_LABELS[lang]}
        </option>
      ))}
    </select>
  );
}
