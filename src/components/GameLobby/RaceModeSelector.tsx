import { useTranslation } from "react-i18next";
import { RACE_MODE_OPTIONS } from "../../lib/gameSettings";
import type { RaceMode } from "../../types/game";

interface RaceModeSelectorProps {
  value: RaceMode;
  onChange: (value: RaceMode) => void;
  variant?: "light" | "dark";
}

/**
 * Host-only lobby control: how the room plays the puzzle.
 * versus = claim cells on one grid · coop = fill one grid together ·
 * async = everyone solves their own copy, fastest time wins.
 */
export function RaceModeSelector({ value, onChange, variant = "light" }: RaceModeSelectorProps) {
  const { t } = useTranslation();
  const isDark = variant === "dark";

  const selectedOption = RACE_MODE_OPTIONS.find((o) => o.value === value) ?? RACE_MODE_OPTIONS[0];

  return (
    <div className="w-full max-w-sm">
      <p className={`text-sm font-semibold uppercase tracking-wide mb-2 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
        {t("lobby.modeHeading")}
      </p>
      <div className="flex gap-1.5" role="radiogroup" aria-label={t("lobby.modeHeading")}>
        {RACE_MODE_OPTIONS.map((option) => {
          const selected = value === option.value;
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
                  ? "bg-blue-600 text-white"
                  : isDark
                    ? "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {t(option.labelKey)}
            </button>
          );
        })}
      </div>
      <p className={`text-xs mt-1.5 leading-snug ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
        {t(selectedOption.descriptionKey)}
      </p>
    </div>
  );
}
