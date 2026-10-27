import type { ReactNode } from "react";
import { TransitionLink } from "./ui/TransitionLink";
import { ArrowLeft } from "lucide-react";
import { AccountControl } from "./Account/AccountControl";

export interface SiteBarProps {
  /** Label for the back control; omit to hide it. */
  backLabel?: string;
  backTo?: string;
  /** A handler instead of a route (flow screens that reset state on the way out). */
  onBack?: () => void;
  /** Plain anchors instead of router Links (for screens rendered outside the router's providers). */
  plain?: boolean;
  right?: ReactNode;
}

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg max-sm:min-w-11 max-sm:justify-center text-sm font-semibold text-ink-soft hover:text-brand-700 active:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500";
const LOGO = "inline-flex min-h-11 shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * Top bar for inner pages: logo (home link) on the left; optional right slot
 * and back control on the right. Width-agnostic — it fills whatever column
 * PageShell puts it in, so its edges are the page's edges. Named for view
 * transitions: the bar (`site-bar`) holds still between inner pages and the
 * logo image (`brand`) is what the menu's wordmark morphs into. Its links
 * warm the next chunk on intent. The account control (avatar or "Sign in")
 * ends the bar on every page that has one; it renders nothing outside
 * AccountProvider (the legal pages, /host), so `plain` pages stay plain.
 */
// "/" is the cold-start resolver (it resumes a saved game or room); in-app
// links that mean "the menu" go to /menu so they never land in a puzzle.
export function SiteBar({ backLabel, backTo = "/menu", onBack, plain, right }: SiteBarProps) {
  const backInner = (
    <>
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span className="max-sm:sr-only">{backLabel}</span>
    </>
  );
  // The asset is cropped to the wordmark, so these heights are the visible
  // height: 36px keeps each letter tile legible on phones, 44px from sm up.
  const logo = <img src="/logo.png" alt="Crossword Clash" width={2292} height={500} className="vt-brand h-9 w-auto sm:h-11" />;
  let back: ReactNode = null;
  if (backLabel) {
    back = onBack ? (
      <button type="button" onClick={onBack} className={LINK}>{backInner}</button>
    ) : plain ? (
      <a href={backTo} className={LINK}>{backInner}</a>
    ) : (
      <TransitionLink to={backTo} className={LINK}>{backInner}</TransitionLink>
    );
  }
  return (
    <header data-site-bar className="vt-site-bar flex w-full items-center justify-between gap-3">
      {plain ? (
        <a href="/menu" className={LOGO}>{logo}</a>
      ) : (
        <TransitionLink to="/menu" className={LOGO}>{logo}</TransitionLink>
      )}
      <div data-site-bar-right className="flex items-center gap-2">
        {right}
        {back}
        {!plain && <AccountControl />}
      </div>
    </header>
  );
}
