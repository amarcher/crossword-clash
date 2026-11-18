import type { ComponentType, ReactNode } from "react";
import { TransitionLink } from "./TransitionLink";
import { ChevronRight, type LucideIcon } from "lucide-react";

interface ListRowProps {
  /** A lucide icon, or any component that draws one in its place (the Plus seal). */
  icon: LucideIcon | ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
  title: ReactNode;
  subtitle?: ReactNode;
  to?: string;
  /** Plain anchor for non-router pages (e.g. static /install-bookmarklet). */
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "brand" | "gold" | "neutral";
  className?: string;
}

const TONES = {
  brand: "bg-brand-50 text-brand-600",
  gold: "bg-gold-50 text-gold-700",
  neutral: "bg-surface-sunken text-ink-soft",
};

// The first and last rows carry the group's radius: the group clips its
// corners, and an inset outline on a square row would show square corners
// there (an outline follows the element's own border-radius, not the parent's).
const ROW =
  "group flex w-full items-center gap-3.5 px-4 py-3 min-h-16 text-left transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-surface-sunken/70 active:bg-surface-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 aria-disabled:pointer-events-none aria-disabled:opacity-45";

/** One tappable row inside a ListGroup: icon tile, title + subtitle, chevron. */
export function ListRow({ icon: Icon, title, subtitle, to, href, onClick, disabled, tone = "brand", className = "" }: ListRowProps) {
  const body = (
    <>
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONES[tone]}`}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug text-ink">{title}</span>
        {/* One line, always: rows in a group stay the same height, so the copy must fit a 375px phone (about 32 characters). */}
        {subtitle && <span className="mt-0.5 block truncate text-sm leading-snug text-muted">{subtitle}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </>
  );
  if (href) {
    return (
      <a href={href} onClick={onClick} className={`${ROW} ${className}`}>
        {body}
      </a>
    );
  }
  if (to) {
    return (
      <TransitionLink to={to} onClick={onClick} aria-disabled={disabled || undefined} className={`${ROW} ${className}`}>
        {body}
      </TransitionLink>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-disabled={disabled || undefined} className={`${ROW} ${className}`}>
      {body}
    </button>
  );
}

export function ListGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-card divide-y divide-line ${className}`}>
      {children}
    </div>
  );
}
