import { useTranslation } from "react-i18next";
import { WRONG_ANSWER_TIMEOUT_OPTIONS } from "../../lib/gameSettings";

interface TimeoutSelectorProps {
  value: number;
  onChange: (value: number) => void;
  variant?: "light" | "dark";
}

export function TimeoutSelector({ value, onChange, variant = "light" }: TimeoutSelectorProps) {
  const { t } = useTranslation();
  const isDark = variant === "dark";

  return (
    <div className="w-full max-w-sm">
      <p className={`text-sm font-semibold uppercase tracking-wide mb-2 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
        {t('timeout.wrongAnswerPenalty')}
      </p>
      <div className="flex gap-1.5" role="radiogroup" aria-label={t('timeout.wrongAnswerPenalty')}>
        {WRONG_ANSWER_TIMEOUT_OPTIONS.map((option) => {
          const selected = value === option.value;
          const label = option.value === 0 ? t('timeout.off') : option.label;
          return (
            <button
              key={option.value}
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`flex-1 px-2 py-1.5 rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                isDark ? "focus-visible:ring-offset-neutral-900" : ""
              } ${
                selected
                  ? isDark
                    ? "bg-blue-600 text-white"
                    : "bg-blue-600 text-white"
                  : isDark
                    ? "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
