import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import es from "./es.json";

const STORAGE_KEY = "crossword-clash:language";

export const SUPPORTED_LANGS = ["en", "es"] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

function detectLanguage(): SupportedLang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGS.includes(stored as SupportedLang)) {
      return stored as SupportedLang;
    }
  } catch {
    // localStorage unavailable (SSR / node test env)
  }

  if (typeof navigator !== "undefined") {
    const browserLang = navigator.language?.slice(0, 2);
    if (SUPPORTED_LANGS.includes(browserLang as SupportedLang)) {
      return browserLang as SupportedLang;
    }
  }

  return "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    // localStorage unavailable
  }
});

/** For use outside React components (window.confirm, alert, etc.) */
export function tStatic(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

export default i18n;
