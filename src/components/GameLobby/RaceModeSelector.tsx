import { useTranslation } from "react-i18next";
import { RACE_MODE_OPTIONS } from "../../lib/gameSettings";
import type { RaceMode } from "../../types/game";
import { SegmentedControl } from "./SegmentedControl";

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
    <div className="w-full">
      <p className={`mb-2 text-sm font-semibold ${isDark ? "uppercase tracking-wide text-neutral-400" : "text-ink-soft"}`}>
        {t("lobby.modeHeading")}
      </p>
      <SegmentedControl
        label={t("lobby.modeHeading")}
        variant={variant}
        value={value}
        onChange={onChange}
        options={RACE_MODE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
      />
      <p className={`mt-2 text-sm leading-snug ${isDark ? "text-neutral-400" : "text-muted"}`}>
        {t(selectedOption.descriptionKey)}
      </p>
    </div>
  );
}
