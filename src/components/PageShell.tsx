import type { ReactNode } from "react";
import { SiteBar, type SiteBarProps } from "./SiteBar";

/** Content column tokens (Tailwind max-w-*). */
export type ShellWidth = "md" | "2xl" | "3xl" | "4xl" | "5xl" | "7xl";

// Spelled out so Tailwind's scanner sees every class.
const MAX_W: Record<ShellWidth, string> = {
  md: "max-w-md",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
};
const MAX_W_LG: Record<ShellWidth, string> = {
  md: "lg:max-w-md",
  "2xl": "lg:max-w-2xl",
  "3xl": "lg:max-w-3xl",
  "4xl": "lg:max-w-4xl",
  "5xl": "lg:max-w-5xl",
  "7xl": "lg:max-w-7xl",
};

/** The one horizontal gutter: 16px on phones, 24px from md. GameLayout's header uses it too. */
export const PAGE_GUTTER = "px-4 md:px-6";

/** The centred column a page lays its content in; the shell puts the site bar in the same one. */
export function pageColumnClass(width: ShellWidth, widthLg?: ShellWidth): string {
  return `mx-auto w-full ${MAX_W[width]} ${widthLg ? MAX_W_LG[widthLg] : ""} ${PAGE_GUTTER}`.replace(/\s+/g, " ").trim();
}

interface PageShellProps {
  width: ShellWidth;
  /** A wider column from lg up (the lobby's two-column layout). */
  widthLg?: ShellWidth;
  /** Props for the shared bar, which is always rendered (logo only when empty). */
  bar?: SiteBarProps;
  /** The studio sits on the flat canvas; everything else on the crossword texture. */
  background?: "crossword" | "canvas";
  /** Stretch the column to the viewport so a child can centre itself (notice screens). */
  grow?: boolean;
  as?: "div" | "main";
  /**
   * Full-width content rendered after the column — a sticky band that must
   * span the viewport. Wrap anything inside it that should line up with the
   * page in `pageColumnClass`.
   */
  below?: ReactNode;
  children: ReactNode;
}

/**
 * Page shell for every screen outside the game and the menu: the site bar and
 * the page content share one `mx-auto max-w-* px-*` column, so the logo's
 * left edge and the right slot's right edge land on the content's edges by
 * construction, whatever width the page chose.
 */
export function PageShell({ width, widthLg, bar, background = "crossword", grow, as = "div", below, children }: PageShellProps) {
  const Root = as;
  return (
    <Root
      className={`min-h-dvh pb-10 pt-2 ${
        background === "canvas" ? "bg-canvas" : "crossword-bg"
      } ${grow ? "flex flex-col" : ""}`}
    >
      <div data-page-column className={`${pageColumnClass(width, widthLg)} ${grow ? "flex flex-1 flex-col" : ""}`}>
        <SiteBar {...bar} />
        {children}
      </div>
      {below}
    </Root>
  );
}
