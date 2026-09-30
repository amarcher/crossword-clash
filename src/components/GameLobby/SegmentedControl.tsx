import type { KeyboardEvent } from "react";

interface Option<T> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "light" | "dark";
}

/**
 * Radio-group segmented control shared by the lobby settings. Each label is the
 * direct text of its button. Arrow keys move the selection (roving tabindex).
 */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  variant = "light",
}: SegmentedControlProps<T>) {
  const isDark = variant === "dark";

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    (e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[options.indexOf(next)])?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={
        isDark
          ? "flex gap-1.5"
          : "grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-surface-sunken p-1 ring-1 ring-inset ring-line"
      }
    >
      {options.map((option) => {
        const selected = value === option.value;
        const base =
          "min-h-11 px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ";
        const skin = isDark
          ? `flex-1 rounded-full py-1.5 font-medium ${
              selected ? "bg-blue-600 text-white" : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`
          : `rounded-lg ${
              selected
                ? "bg-brand-600 text-white shadow-card"
                : "text-ink-soft hover:bg-surface active:bg-line"
            }`;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={base + skin}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
