import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageShell } from "../PageShell";

interface FlowPageProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small label above the title (e.g. "Room"). */
  eyebrow?: ReactNode;
  /** Shows the shared back control in the bar's right slot when provided. */
  onBack?: () => void;
  backLabel?: string;
  /** Right-aligned header control (e.g. Leave / Close room), next to the back control. */
  action?: ReactNode;
  /** Two-column desktop layouts (lobby) get a wider container. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * Shared shell for the pre-play multiplayer flows (join, host name, lobby,
 * puzzle ready): the site bar (logo left, back + action right), display-font
 * title, phone column that widens on desktop. Children are the page body.
 */
export function FlowPage({ title, subtitle, eyebrow, onBack, backLabel, action, wide, children }: FlowPageProps) {
  const { t } = useTranslation();
  return (
    <PageShell
      width="md"
      widthLg={wide ? "4xl" : undefined}
      bar={{ onBack, backLabel: onBack ? (backLabel ?? t("common.back")) : undefined, right: action }}
    >
      <header className="mt-4 sm:mt-6">
        {eyebrow && <div className="mb-1">{eyebrow}</div>}
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[15px] leading-snug text-muted">{subtitle}</p>}
      </header>
      <div className="mt-6">{children}</div>
    </PageShell>
  );
}
