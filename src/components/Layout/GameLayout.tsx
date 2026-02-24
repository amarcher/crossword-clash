import type { ReactNode } from "react";

interface GameLayoutProps {
  header: ReactNode;
  grid: ReactNode;
  clues: ReactNode;
  sidebar?: ReactNode;
}

export function GameLayout({ header, grid, clues, sidebar }: GameLayoutProps) {
  return (
    <div className="h-dvh bg-neutral-50 flex flex-col overflow-hidden">
      <header className="bg-white border-b border-neutral-200 px-4 py-3 shrink-0">
        {header}
      </header>
      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 min-h-0 w-full items-center overflow-hidden">
        {sidebar && (
          <div className="shrink-0 w-full md:w-48 min-h-0">
            {sidebar}
          </div>
        )}
        <div className="shrink-0">
          {grid}
        </div>
        <div className="flex-1 min-w-0 min-h-0 self-stretch">
          {clues}
        </div>
      </main>
    </div>
  );
}
