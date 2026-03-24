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

  if (!NYT_AFFILIATE_URL) return null;

  if (variant === "inline") {
    const color = darkMode ? "text-neutral-500" : "text-neutral-400";
    const linkColor = darkMode
      ? "text-neutral-400 hover:text-neutral-300"
      : "text-neutral-500 hover:text-neutral-600";
    return (
      <p className={`text-xs ${color} text-center`}>
        {t("nyt.inlineText")}{" "}
        <a
          href={NYT_AFFILIATE_URL}
          target="_blank"
          rel="sponsored noopener"
          className={`underline ${linkColor}`}
        >
          {t("nyt.inlineCta")}
        </a>
      </p>
    );
  }

  const border = darkMode ? "border-neutral-700" : "border-neutral-200";
  const text = darkMode ? "text-neutral-400" : "text-neutral-500";
  const linkColor = darkMode
    ? "text-blue-400 hover:text-blue-300"
    : "text-blue-500 hover:text-blue-600";

  return (
    <div
      className={`w-full max-w-md border ${border} rounded-lg p-3 text-center`}
    >
      <p className={`text-sm ${text}`}>
        {t("nyt.cardText")}{" "}
        <a
          href={NYT_AFFILIATE_URL}
          target="_blank"
          rel="sponsored noopener"
          className={`underline ${linkColor}`}
        >
          {t("nyt.cardCta")}
        </a>
      </p>
    </div>
  );
}
