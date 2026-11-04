import type { ReactNode } from "react";
import { TVBrand } from "./TVBrand";

/** The quiet link under a TV screen's main action (back to the menu, another puzzle). */
export const TV_QUIET_LINK =
  "tv-t-md inline-flex min-h-11 items-center rounded-xl px-4 text-slate-300 transition-colors hover:bg-stage-raised hover:text-white active:bg-stage-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

/** Centered stage shell for the simple /host screens (menu, importing, rejoin, puzzle-ready); `footer` holds the way out. */
export function TVScreen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div
      className="tv-stage tv-stage-scroll flex flex-col items-center justify-center text-center"
      style={{ padding: "calc(var(--u) * 2)", gap: "calc(var(--u) * 2)" }}
    >
      <TVBrand height="calc(var(--u) * 5)" />
      {children}
      {footer && <div className="flex flex-wrap items-center justify-center gap-2">{footer}</div>}
    </div>
  );
}
