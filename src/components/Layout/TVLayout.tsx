import type { ReactNode } from "react";
import { TVBrand } from "./TVBrand";

interface TVLayoutProps {
  grid: ReactNode;
  /** Persistent room-code card (kept visible so late joiners can join). */
  sidebar: ReactNode;
  scoreboard: ReactNode;
  clues?: ReactNode;
  controls?: ReactNode;
}

/** Spectate composition: the grid takes all the room it can; scoreboard + clues live in a right rail. */
export function TVLayout({ grid, sidebar, scoreboard, clues, controls }: TVLayoutProps) {
  return (
    <div className="tv-stage">
      <main className="tv-main">
        <div className="tv-grid-slot">{grid}</div>
        <div className="tv-side">
          <div className="flex shrink-0 items-center justify-between gap-3">
            <TVBrand height="calc(var(--u) * 2.8)" />
            {controls}
          </div>
          <div className="shrink-0">{sidebar}</div>
          <div className="shrink-0">{scoreboard}</div>
          {clues && <div className="tv-clues-box tv-card min-h-0 flex-1 overflow-hidden" style={{ padding: "calc(var(--u) * 1)" }}>{clues}</div>}
        </div>
      </main>
    </div>
  );
}
