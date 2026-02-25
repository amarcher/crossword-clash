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
      <main className="flex-1 flex flex-row gap-6 p-6 min-h-0 items-center justify-center">
        {clues && (
          <div className="w-72 shrink-0 self-stretch min-h-0 overflow-hidden">
            {clues}
          </div>
        )}
        <div className="shrink-0">
          {grid}
        </div>
        <div className="w-72 shrink-0 flex flex-col gap-4 self-stretch min-h-0 justify-center">
          {sidebar}
          {scoreboard}
        </div>
      </main>
    </div>
  );
}
