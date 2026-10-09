import { useTranslation } from "react-i18next";

const NYT_AFFILIATE_URL = import.meta.env.VITE_NYT_AFFILIATE_URL as
  | string
  | undefined;

interface NytRecommendationProps {
  variant?: "card" | "inline";
  darkMode?: boolean;
}

export function NytRecommendation({
  variant = "card",
  darkMode = false,
}: NytRecommendationProps) {
  const { t } = useTranslation();

  // Website only: the native apps carry no sponsored links.
  if (!NYT_AFFILIATE_URL || import.meta.env.MODE === "mobile") return null;

  if (variant === "inline") {
    const color = darkMode ? "text-subtle" : "text-muted";
    const linkColor = darkMode
      ? "text-stage-line hover:text-white"
      : "text-ink-soft hover:text-brand-700";
    return (
      <p className={`text-xs ${color} text-center`}>
        {t("nyt.inlineText")}{" "}
        <a
          href={NYT_AFFILIATE_URL}
          target="_blank"
          rel="sponsored noopener"
          className={`underline underline-offset-2 ${linkColor}`}
        >
          {t("nyt.inlineCta")}
        </a>
      </p>
    );
  }

  const surface = darkMode ? "border-stage-line bg-stage-raised" : "border-line bg-surface shadow-card";
  const text = darkMode ? "text-subtle" : "text-muted";
  const linkColor = darkMode
    ? "text-brand-200 hover:text-white"
    : "text-brand-700 hover:text-brand-800";

  return (
    <div className={`w-full max-w-md rounded-2xl border ${surface} px-4 py-3 text-center`}>
      <p className={`text-sm ${text}`}>
        {t("nyt.cardText")}{" "}
        <a
          href={NYT_AFFILIATE_URL}
          target="_blank"
          rel="sponsored noopener"
          className={`font-semibold underline underline-offset-2 ${linkColor}`}
        >
          {t("nyt.cardCta")}
        </a>
      </p>
    </div>
  );
}
