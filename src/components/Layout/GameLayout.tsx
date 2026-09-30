import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";

interface GameLayoutProps {
  header: ReactNode;
  grid: ReactNode;
  clues: ReactNode;
  mobileClueBar?: ReactNode;
  keyboard?: ReactNode;
}

export function GameLayout({ header, grid, clues, mobileClueBar, keyboard }: GameLayoutProps) {
  if (Capacitor.isNativePlatform()) {
    return (
      <div className="native-game-layout">
        <header className="native-game-header">{header}</header>
        <main className="native-game-main">
          <div className="native-grid-slot">{grid}</div>
          <aside className="native-game-clues">{clues}</aside>
        </main>
        <footer className="native-game-controls">
          {mobileClueBar}
          {keyboard}
        </footer>
      </div>
    );
  }
  return (
    <div className={`h-dvh bg-canvas flex flex-col overflow-hidden ${mobileClueBar ? "grid-offset-mobile" : ""}`}>
      <header className="bg-surface border-b border-line px-4 py-2 md:px-6 md:py-3 shrink-0">
        {header}
      </header>
      <main className={`flex-1 flex flex-col md:flex-row gap-2 md:gap-6 p-2 md:p-6 min-h-0 w-full items-center overflow-y-auto md:overflow-hidden ${mobileClueBar ? "pb-14 md:pb-6" : ""}`}>
        {/* Phones size the grid from stable svh math (keyboard-safe). From md up
            the slot is a size container and the grid fills its shorter side. */}
        <div className="shrink-0 [--grid-w-offset:1rem] md:flex md:flex-1 md:self-stretch md:min-w-0 md:items-center md:justify-center md:[container-type:size] md:[--native-grid-size:min(100cqw,100cqh)]">
          {grid}
        </div>
        <aside className="flex-1 min-w-48 min-h-0 self-stretch overflow-hidden md:flex-none md:w-[clamp(300px,34vw,500px)]">
          {clues}
        </aside>
      </main>
      {mobileClueBar}
    </div>
  );
}
