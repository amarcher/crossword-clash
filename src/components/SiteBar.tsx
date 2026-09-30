import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";

interface SiteBarProps {
  /** Label for the back link; omit to hide it. */
  backLabel?: string;
  backTo?: string;
  /** Plain anchors instead of router Links (for screens rendered outside the router's providers). */
  plain?: boolean;
  right?: ReactNode;
}

const LINK =
  "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-lg max-sm:min-w-11 max-sm:justify-center text-sm font-semibold text-ink-soft hover:text-brand-700 active:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500";
const LOGO =
  "-ml-1 inline-flex min-h-11 shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500";

/** Top bar for inner pages: logo (home link) on the left; back link + optional right slot on the right. */
export function SiteBar({ backLabel, backTo = "/", plain, right }: SiteBarProps) {
  const backInner = (
    <>
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span className="max-sm:sr-only">{backLabel}</span>
    </>
  );
  // The two-row wordmark needs real height to stay legible; 48px keeps each
  // letter tile readable on phones, 56px from sm up.
  const logo = <img src="/logo.png" alt="Crossword Clash" className="h-12 w-auto object-contain sm:h-14" />;
  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
      {plain ? (
        <a href="/" className={LOGO}>{logo}</a>
      ) : (
        <Link to="/" className={LOGO}>{logo}</Link>
      )}
      <div className="flex items-center gap-2">
        {right}
        {backLabel &&
          (plain ? (
            <a href={backTo} className={LINK}>{backInner}</a>
          ) : (
            <Link to={backTo} className={LINK}>{backInner}</Link>
          ))}
      </div>
    </header>
  );
}
