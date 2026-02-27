import type { ReactNode } from "react";

interface TVLayoutProps {
  grid: ReactNode;
  sidebar: ReactNode;
  scoreboard: ReactNode;
  clues?: ReactNode;
}

export function TVLayout({ grid, sidebar, scoreboard, clues }: TVLayoutProps) {
  return (
    <div className="h-dvh bg-neutral-900 flex flex-col overflow-hidden">
      <main className="flex-1 flex flex-row gap-6 p-6 min-h-0 items-start justify-center">
        <div className="w-64 shrink-0 flex flex-col gap-4 self-stretch min-h-0">
          <h1 className="text-center leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            <span className="block text-4xl font-bold text-white">Crossword</span>
            <span className="block text-4xl font-bold italic text-amber-400">Clash</span>
          </h1>
          {scoreboard}
          {sidebar}
        </div>
        <div className="shrink-0" style={{ "--grid-h-offset": "3rem", "--grid-w-offset": clues ? "46rem" : "22rem" } as React.CSSProperties}>
          {grid}
        </div>
        {clues && (
          <div className="w-96 shrink-0 self-stretch min-h-0 overflow-hidden">
            {clues}
          </div>
        )}
      </main>
    </div>
  );
}
