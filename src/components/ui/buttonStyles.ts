export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "stage";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white shadow-[0_1px_0_rgb(255_255_255/0.15)_inset,0_1px_2px_rgb(20_26_38/0.15)] hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-surface text-ink border border-line-strong shadow-card hover:bg-surface-sunken hover:border-subtle/50 active:bg-line",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  ghost: "text-muted hover:text-ink hover:bg-surface-sunken active:bg-line",
  danger: "bg-surface text-red-600 border border-red-200 hover:bg-red-50 active:bg-red-100",
  stage: "bg-stage-raised text-white border border-stage-line hover:bg-stage-line active:bg-stage-line",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-12 px-5 text-base",
};

/** Class string for anything that should look like a button (button, Link, a). */
export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}
