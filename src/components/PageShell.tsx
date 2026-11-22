import type { ReactNode } from "react";
import { SiteBar, type SiteBarProps } from "./SiteBar";
import { RouteDialogPage, useRouteDialog } from "./RouteDialog/RouteDialog";

/** Content column tokens (Tailwind max-w-*). */
export type ShellWidth = "md" | "2xl" | "3xl" | "4xl" | "5xl" | "7xl" | "full";

// Spelled out so Tailwind's scanner sees every class.
const MAX_W: Record<ShellWidth, string> = {
  md: "max-w-md",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "7xl": "max-w-7xl",
  full: "max-w-7xl min-[100rem]:max-w-none",
};
const MAX_W_MD: Record<ShellWidth, string> = {
  md: "md:max-w-md",
  "2xl": "md:max-w-2xl",
  "3xl": "md:max-w-3xl",
  "4xl": "md:max-w-4xl",
  "5xl": "md:max-w-5xl",
  "7xl": "md:max-w-7xl",
  full: "md:max-w-none",
};
const MAX_W_LG: Record<ShellWidth, string> = {
  md: "lg:max-w-md",
  "2xl": "lg:max-w-2xl",
  "3xl": "lg:max-w-3xl",
  "4xl": "lg:max-w-4xl",
  "5xl": "lg:max-w-5xl",
  "7xl": "lg:max-w-7xl",
  full: "lg:max-w-none",
};

/** The one horizontal gutter: 16px on phones, 24px from md. GameLayout's header uses it too. */
export const PAGE_GUTTER = "px-4 md:px-6";

/** The centred column a page lays its content in; the shell puts the site bar in the same one. */
export function pageColumnClass(width: ShellWidth, widthLg?: ShellWidth, widthMd?: ShellWidth): string {
  return `mx-auto w-full ${MAX_W[width]} ${widthMd ? MAX_W_MD[widthMd] : ""} ${widthLg ? MAX_W_LG[widthLg] : ""} ${PAGE_GUTTER}`.replace(/\s+/g, " ").trim();
}

/**
 * The site bar's own column: the page's on phones, one fixed width from md up,
 * so the logo, the back link and the avatar sit in the same place on every
 * page (and where the menu puts its own) however narrow the content below is.
 */
function barColumnClass(width: ShellWidth, widthLg?: ShellWidth, widthMd?: ShellWidth): string {
  if (width === "7xl" || widthLg === "7xl" || width === "full") return pageColumnClass(width, widthLg, widthMd);
  return `mx-auto w-full ${MAX_W[width]} md:max-w-5xl ${PAGE_GUTTER}`;
}

interface PageShellProps {
  width: ShellWidth;
  /** A wider column from md up: a tablet has room for more than the phone column. */
  widthMd?: ShellWidth;
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
  /**
   * The page's title, drawn as its h1 (with `extra` under it). A screen whose
   * route opens as a dialog on wide windows (`handle: DIALOG_ROUTE`) must pass
   * it: there the title moves into the dialog's title row.
   */
  heading?: PageHeading;
  children: ReactNode;
}

export interface PageHeading {
  title: ReactNode;
  /** Above the title (FlowPage's eyebrow). */
  eyebrow?: ReactNode;
  /** Under the title (a chip, a subtitle). */
  extra?: ReactNode;
  /** `flow`: the pre-play flows' smaller title (FlowPage). */
  variant?: "page" | "flow";
}

function PageHeader({ heading }: { heading: PageHeading }) {
  if (heading.variant === "flow") {
    return (
      <header className="mt-4 sm:mt-6">
        {heading.eyebrow && <div className="mb-1">{heading.eyebrow}</div>}
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">{heading.title}</h1>
        {heading.extra}
      </header>
    );
  }
  return (
    <header className="mb-5 pt-3">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{heading.title}</h1>
      {heading.extra}
    </header>
  );
}

/**
 * Page shell for every screen outside the game and the menu. On phones the
 * site bar and the content share one `mx-auto max-w-* px-*` column, so the
 * bar's edges are the content's. From md up the bar keeps one width across
 * pages (`barColumnClass`) and the content is centred under it.
 */
export function PageShell({ width, widthMd, widthLg, bar, background = "crossword", grow, as = "div", below, heading, children }: PageShellProps) {
  const dialog = useRouteDialog();
  if (dialog) {
    // Inside a route dialog: no site bar, the title in the dialog's title row.
    // A back step to another screen stays (Friends → Race friends); the menu
    // is the page underneath, which Close returns to.
    const back = bar?.backLabel && !bar.onBack && bar.backTo && bar.backTo !== "/menu" ? { label: bar.backLabel, to: bar.backTo } : undefined;
    const wide = (widthLg ?? widthMd ?? width) !== "md";
    return (
      <RouteDialogPage title={heading?.title} width={wide ? "wide" : "narrow"} back={back} action={bar?.right}>
        {(heading?.eyebrow || heading?.extra) && (
          <div className="-mt-1 mb-5">
            {heading.eyebrow}
            {heading.extra}
          </div>
        )}
        {children}
        {below}
      </RouteDialogPage>
    );
  }
  const Root = as;
  return (
    <Root
      className={`min-h-app pb-10 pt-2 ${
        background === "canvas" ? "bg-canvas" : "crossword-bg"
      } ${grow ? "flex flex-col" : ""}`}
    >
      <div className={`${barColumnClass(width, widthLg, widthMd)} mb-2 md:mb-3`}>
        <SiteBar {...bar} />
      </div>
      <div data-page-column className={`${pageColumnClass(width, widthLg, widthMd)} ${grow ? "flex flex-1 flex-col" : ""}`}>
        {heading && <PageHeader heading={heading} />}
        {children}
      </div>
      {below}
    </Root>
  );
}
