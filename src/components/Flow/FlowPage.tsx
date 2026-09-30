import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

interface FlowPageProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small label above the title (e.g. "Room"). */
  eyebrow?: ReactNode;
  /** Shows the shared chevron back button when provided. */
  onBack?: () => void;
  backLabel?: string;
  /** Right-aligned header control (e.g. Leave / Close room). */
  action?: ReactNode;
  /** Two-column desktop layouts (lobby) get a wider container. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * Shared shell for the pre-play multiplayer flows (join, host name, lobby,
 * puzzle ready): chevron back button, display-font title, phone column that
 * widens on desktop. Children are the page body.
 */
export function FlowPage({ title, subtitle, eyebrow, onBack, backLabel, action, wide, children }: FlowPageProps) {
  return (
    <div className="min-h-dvh crossword-bg">
      <div className={`mx-auto w-full px-4 pb-8 ${wide ? "max-w-md lg:max-w-4xl" : "max-w-md"}`}>
        <header className="pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="flex h-14 items-center">
            {onBack && <BackButton onClick={onBack} label={backLabel} />}
            {action && <div className="ml-auto">{action}</div>}
          </div>
          {eyebrow && <div className="mb-1">{eyebrow}</div>}
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] leading-snug text-muted">{subtitle}</p>}
        </header>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

/** Icon-only back control used by every flow screen (44px target, offset to align with the gutter). */
export function BackButton({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-ml-3 grid size-11 place-items-center rounded-xl text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      <ChevronLeft className="size-6" aria-hidden="true" />
    </button>
  );
}
