import { useTranslation } from "react-i18next";

interface TitleProps {
  variant?: "light" | "dark";
  className?: string;
}

export function Title({ variant = "light", className = "" }: TitleProps) {
  const { t } = useTranslation();
  const topColor = variant === "dark" ? "text-white" : "text-neutral-900";
  const bottomColor = variant === "dark" ? "text-amber-400" : "text-amber-500";

  return (
    <h1
      className={`text-center leading-tight ${className}`}
      style={{ fontFamily: "'Playfair Display', serif" }}
    >
      <span className={`block text-5xl font-bold ${topColor}`}>{t('title.crossword')}</span>
      <span className={`block text-5xl font-bold italic ${bottomColor}`}>{t('title.clash')}</span>
    </h1>
  );
}
