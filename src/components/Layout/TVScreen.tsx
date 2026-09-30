import type { ReactNode } from "react";
import { TVBrand } from "./TVBrand";

/** Centered stage shell for the simple /host screens (menu, importing, rejoin, puzzle-ready). */
export function TVScreen({ children }: { children: ReactNode }) {
  return (
    <div
      className="tv-stage tv-stage-scroll flex flex-col items-center justify-center text-center"
      style={{ padding: "calc(var(--u) * 2)", gap: "calc(var(--u) * 2)" }}
    >
      <TVBrand height="calc(var(--u) * 5)" />
      {children}
    </div>
  );
}
