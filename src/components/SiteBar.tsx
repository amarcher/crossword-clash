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
  "inline-flex min-h-11 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500";

/** Compact top bar for inner pages: back link, logo (home link), optional right slot. */
export function SiteBar({ backLabel, backTo = "/", plain, right }: SiteBarProps) {
  const backInner = (
    <>
      <ArrowLeft className="size-4" aria-hidden="true" />
      <span className="max-sm:sr-only">{backLabel}</span>
    </>
  );
  const logo = <img src="/logo.png" alt="Crossword Clash" className="h-10 w-auto object-contain" />;
  return (
    <header className="mx-auto grid w-full max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex justify-start">
        {backLabel &&
          (plain ? (
            <a href={backTo} className={LINK}>{backInner}</a>
          ) : (
            <Link to={backTo} className={LINK}>{backInner}</Link>
          ))}
      </div>
      {plain ? (
        <a href="/" className={LOGO}>{logo}</a>
      ) : (
        <Link to="/" className={LOGO}>{logo}</Link>
      )}
      <div className="flex justify-end">{right}</div>
    </header>
  );
}
