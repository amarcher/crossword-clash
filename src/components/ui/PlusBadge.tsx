import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { usePlusBadge } from "../../lib/plusBadges";

/** A scalloped seal: the radius rises and falls ten times around the circle, like a rosette. */
function sealPath(cx: number, cy: number, r: number, lobes: number, depth: number): string {
  const points: string[] = [];
  const steps = 160;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const radius = r * (1 - depth * (0.5 - 0.5 * Math.cos(lobes * a)));
    points.push(`${(cx + radius * Math.cos(a)).toFixed(2)},${(cy + radius * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

const SEAL = sealPath(12, 12, 11.6, 10, 0.16);

/** The gold seal itself, undescribed: also the Plus mark inside controls that already say "Plus" (Andrew, 2026-11-13: option B of docs/plus-expansion/badge-options.html). */
export function PlusSeal({ size = "1em" }: { size?: string }) {
  const gradient = useId();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: size, height: size }} className="inline-block shrink-0 align-[-0.12em]">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd25a" />
          <stop offset="1" stopColor="#e09a00" />
        </linearGradient>
      </defs>
      <path d={SEAL} fill={`url(#${gradient})`} />
      <path d={SEAL} fill="none" stroke="#b07a00" strokeOpacity=".35" strokeWidth=".8" />
      <path d="M12 7.2v9.6M7.2 12h9.6" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

interface PlusBadgeProps {
  /** CSS size; follows the name's type size by default. */
  size?: string;
  /** Tapping opens "Crossword Clash Plus member" (and Get Plus for a viewer without it). Off inside links and buttons. */
  interactive?: boolean;
}

/**
 * The Plus badge after a name (docs/plus-expansion-spec.md §5). Tapping it
 * says what it is and, for a viewer without Plus, offers the pitch
 * (`paywall_viewed { placement: "badge" }`).
 */
export function PlusBadge({ size = "0.95em", interactive = true }: PlusBadgeProps) {
  const { t } = useTranslation();
  const account = useMaybeAccount();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!interactive) {
    return (
      <span role="img" aria-label={t("plus.badgeLabel")} className="inline-flex">
        <PlusSeal size={size} />
      </span>
    );
  }
  const offerPlus = !!account?.available && account.plusReady && !account.plus;
  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={t("plus.badgeLabel")}
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="-m-1 inline-flex cursor-pointer rounded-full p-1 focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <PlusSeal size={size} />
      </button>
      {open && (
        <span
          id={popoverId}
          role="dialog"
          aria-label={t("plus.badgeLabel")}
          className="lf-pop-in absolute left-1/2 top-full z-40 mt-1.5 w-max max-w-56 -translate-x-1/2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm font-normal normal-case tracking-normal text-ink shadow-overlay"
        >
          <span className="flex items-center gap-1.5 font-semibold">
            <PlusSeal size="1em" />
            {t("plus.badgeLabel")}
          </span>
          {offerPlus && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                account.openPaywall({ placement: "badge", feature: "badge" });
              }}
              className="mt-1 block cursor-pointer font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-500"
            >
              {t("plus.badgeGetPlus")}
            </button>
          )}
        </span>
      )}
    </span>
  );
}

/**
 * A name with its badge kept on the same line: `<PlusName userId=… >Sam</PlusName>`.
 * The badge shows when that person wears it (plusBadges.ts); the name itself is unchanged.
 */
export function PlusName({ userId, username, interactive = true, children }: { userId?: string | null; username?: string | null; interactive?: boolean; children: ReactNode }) {
  const badge = usePlusBadge({ userId, username });
  if (!badge) return <>{children}</>;
  return (
    <span className="inline-flex max-w-full items-center gap-[0.25em] whitespace-nowrap">
      <span className="min-w-0 truncate">{children}</span>
      <PlusBadge interactive={interactive} />
    </span>
  );
}

/** Just the badge, for a name rendered elsewhere (beside a link, in a table cell): nothing when that person doesn't wear it. */
export function PlusBadgeFor({ userId, username, interactive = true }: { userId?: string | null; username?: string | null; interactive?: boolean }) {
  return usePlusBadge({ userId, username }) ? <PlusBadge interactive={interactive} /> : null;
}
