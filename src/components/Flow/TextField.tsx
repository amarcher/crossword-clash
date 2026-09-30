import type { ComponentProps } from "react";

/** Shared text-input styling: 48px tall, 16px text (no iOS zoom), brand focus ring. */
export const inputClass =
  "h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-ink shadow-card placeholder:text-subtle transition-shadow focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-4 focus-visible:ring-brand-500/20";

interface TextFieldProps extends ComponentProps<"input"> {
  id: string;
  label: string;
}

export function TextField({ id, label, className = "", ...rest }: TextFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-soft">
        {label}
      </label>
      <input id={id} className={`${inputClass} ${className}`} {...rest} />
    </div>
  );
}
