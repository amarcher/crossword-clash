import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { useTranslation } from "react-i18next";
import { PAGE_GUTTER } from "../PageShell";
import { setHardwareKeyboard, useHardwareKeyboard } from "../../lib/inputModality";
import { useKeyboardInset } from "../../hooks/useKeyboardInset";
import { useMediaQuery } from "../../hooks/useMediaQuery";

interface GameLayoutProps {
  header: ReactNode;
  grid: ReactNode;
  clues: ReactNode;
  mobileClueBar?: ReactNode;
  keyboard?: ReactNode;
  /**
   * The bare clue lists for the apps' medium layout (`MEDIUM_QUERY`): shown
   * between the clue bar and the keys. Sized by that box, not the viewport,
   * so pass `<CluePanel columns />`.
   */
  clueLists?: ReactNode;
}

/**
 * A screen too narrow for the clue list beside the grid (that starts at
 * 768px) but with height to spare: an unfolded iPhone Duo (669 × 951), an
 * iPad in Split View, a small tablet in portrait. A band of clue lists
 * under the clue bar saves opening the clue sheet for every look at the list;
 * the grid gives up height for it and still has larger squares than a phone
 * (Andrew, 2026-11-17).
 */
export const MEDIUM_QUERY = "(min-width: 600px) and (max-width: 767.98px) and (min-height: 820px)";

/**
 * The apps' play screen: header, grid (with the clue list beside it from 768px),
 * and a footer with the clue bar and the in-app keyboard. Once a physical
 * keyboard is used the in-app keys give way to a "Show keyboard" button, and
 * where the clue list is on screen the clue bar goes too (Tab, Space and the
 * arrows do its job) — see `inputModality.ts`. Between a phone and 768px
 * (`MEDIUM_QUERY`) the clue lists sit in a band under the clue bar.
 */
export function NativeGameLayout({ header, grid, clues, mobileClueBar, keyboard, clueLists }: GameLayoutProps) {
  const { t } = useTranslation();
  const hardware = useHardwareKeyboard();
  const medium = useMediaQuery(MEDIUM_QUERY);
  return (
    <div className="native-game-layout" data-keyboard={hardware ? "hardware" : "screen"} data-size={medium ? "medium" : undefined}>
      <header className="native-game-header">{header}</header>
      <main className="native-game-main">
        <div className="native-grid-slot">{grid}</div>
        <aside className="native-game-clues">{clues}</aside>
      </main>
      <footer className="native-game-controls">
        {mobileClueBar}
        {medium && clueLists && <div className="native-clue-lists">{clueLists}</div>}
        {hardware && keyboard ? (
          <div className="native-keyboard-toggle">
            <button type="button" onClick={() => setHardwareKeyboard(false)}>
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="2.5" y="6" width="19" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
                <path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t("keyboard.show")}
            </button>
          </div>
        ) : keyboard}
      </footer>
    </div>
  );
}

export function GameLayout(props: GameLayoutProps) {
  if (Capacitor.isNativePlatform()) return <NativeGameLayout {...props} />;
  return <WebGameLayout {...props} />;
}

/**
 * The website's play screen. On a phone `main` is the scroller: the grid
 * fills the width and never shrinks, so with the keyboard up its bottom rows
 * sit under the keys — the scroller is padded by the keyboard inset so they
 * can scroll up past it, and CrosswordGrid scrolls the active cell into view
 * (only when it is hidden).
 */
function WebGameLayout({ header, grid, clues, mobileClueBar }: GameLayoutProps) {
  const keyboardInset = useKeyboardInset();
  return (
    <div className={`h-dvh bg-canvas flex flex-col overflow-hidden ${mobileClueBar ? "grid-offset-mobile" : ""}`}>
      {/* Same gutter as PageShell, so the title sits where the menu and inner pages put their content. */}
      <header className={`bg-surface border-b border-line py-2 md:py-3 shrink-0 ${PAGE_GUTTER}`}>
        {header}
      </header>
      <main
        className={`flex-1 flex flex-col md:flex-row gap-2 md:gap-6 p-2 md:p-6 min-h-0 w-full items-center overflow-y-auto overscroll-contain md:overflow-hidden ${mobileClueBar ? "pb-14 md:pb-6" : ""}`}
        style={mobileClueBar && keyboardInset > 0 ? { paddingBottom: `calc(3.5rem + ${keyboardInset}px)` } : undefined}
      >
        {/* Phones size the grid from stable svh math (keyboard-safe). From md up
            the slot is a size container and the grid fills its shorter side. */}
        <div className="shrink-0 [--grid-w-offset:1rem] md:flex md:flex-1 md:self-stretch md:min-w-0 md:items-center md:justify-center md:[container-type:size] md:[--native-grid-size:min(100cqw,100cqh)]">
          {grid}
        </div>
        {/* On a phone the clue lists run at their full height under the grid and the page (main) scrolls: squeezed into what the grid left, they were cut off mid-line with rows too small to tap. */}
        <aside className="min-w-48 self-stretch max-md:flex-none md:min-h-0 md:overflow-hidden md:flex-none md:w-[clamp(300px,34vw,500px)]">
          {clues}
        </aside>
      </main>
      {mobileClueBar}
    </div>
  );
}
