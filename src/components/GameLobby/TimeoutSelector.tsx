import { useTranslation } from "react-i18next";
import { WRONG_ANSWER_TIMEOUT_OPTIONS } from "../../lib/gameSettings";
import { SegmentedControl } from "./SegmentedControl";

interface TimeoutSelectorProps {
  value: number;
  onChange: (value: number) => void;
  variant?: "light" | "dark";
}

export function TimeoutSelector({ value, onChange, variant = "light" }: TimeoutSelectorProps) {
  const { t } = useTranslation();
  const isDark = variant === "dark";
  const heading = t("timeout.wrongAnswerPenalty");

  return (
    <div className="w-full">
      <p className={`mb-2 text-sm font-semibold ${isDark ? "uppercase tracking-wide text-neutral-400" : "text-ink-soft"}`}>
        {heading}
      </p>
      <SegmentedControl
        label={heading}
        variant={variant}
        value={value}
        onChange={onChange}
        options={WRONG_ANSWER_TIMEOUT_OPTIONS.map((o) => ({
          value: o.value,
          label: o.value === 0 ? t("timeout.off") : o.label,
        }))}
      />
    </div>
  );
}
