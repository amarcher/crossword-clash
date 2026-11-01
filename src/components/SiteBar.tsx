import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
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
 * Top bar for inner pages. On the website: logo (home link) on the left, the
 * optional right slot, back control and account control on the right. In the
 * apps (`Capacitor.isNativePlatform()`): the back control on the left, the
 * logo centred, the right slot and account control on the right — the
 * arrangement every other app on the phone uses, which players reached for
 * (Andrew, 2026-11-01). Width-agnostic — it fills whatever column PageShell
 * puts it in, so its edges are the page's edges. Named for view transitions:
 * the bar (`site-bar`) holds still between inner pages and the logo image
 * (`brand`) is what the menu's wordmark morphs into. Its links warm the next
 * chunk on intent. The account control (avatar or "Sign in") ends the bar on
 * every page that has one; it renders nothing outside AccountProvider (the
 * legal pages, /host), so `plain` pages stay plain.
 */
// "/" is the cold-start resolver (it resumes a saved game or room); in-app
// links that mean "the menu" go to /menu so they never land in a puzzle.
export function SiteBar({ backLabel, backTo = "/menu", onBack, plain, right }: SiteBarProps) {
  const native = Capacitor.isNativePlatform();
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
  const home = plain ? (
    <a href="/menu" className={LOGO}>{logo}</a>
  ) : (
    <TransitionLink to="/menu" className={LOGO}>{logo}</TransitionLink>
  );
  const account = !plain && <AccountControl />;
  // `relative z-30`: the header's view-transition-name makes it a stacking context of its own, so
  // without a z-index of its own every menu that opens from it (the avatar menu, the studio's
  // account menu) painted under positioned content further down the page, like the studio grid.
  // Dialogs (z-50) and the studio tab bar (z-40) still sit above it.
  if (native) {
    // Three columns, the outer two equal, so the logo sits on the page's centre line whatever is
    // beside it (a lone back arrow on the left, an avatar on the right) as long as both fit.
    return (
      <header data-site-bar data-site-bar-layout="native" className="vt-site-bar relative z-30 grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div data-site-bar-left className="flex items-center justify-start">{back}</div>
        {home}
        <div data-site-bar-right className="flex items-center justify-end gap-2">
          {right}
          {account}
        </div>
      </header>
    );
  }
  return (
    <header data-site-bar className="vt-site-bar relative z-30 flex w-full items-center justify-between gap-3">
      {home}
      <div data-site-bar-right className="flex items-center gap-2">
        {right}
        {back}
        {account}
      </div>
    </header>
  );
}
