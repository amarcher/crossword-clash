import type { ReactNode } from "react";

interface GameLayoutProps {
  header: ReactNode;
  grid: ReactNode;
  clues: ReactNode;
}

export function GameLayout({ header, grid, clues }: GameLayoutProps) {
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <header className="bg-white border-b border-neutral-200 px-4 py-3">
        {header}
      </header>
      <main className="flex-1 flex flex-col md:flex-row gap-4 p-4 max-w-5xl mx-auto w-full">
        <div className="flex justify-center md:justify-start">
          {grid}
        </div>
        <div className="flex-1 min-w-0">
          {clues}
        </div>
      </main>
    </div>
  );
}
