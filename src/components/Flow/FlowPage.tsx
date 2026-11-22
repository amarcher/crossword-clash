import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageShell } from "../PageShell";
import { useRouteDialog } from "../RouteDialog/RouteDialog";

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
  const dialog = useRouteDialog();
  return (
    <PageShell
      width="md"
      widthLg={wide ? "5xl" : undefined}
      bar={{ onBack, backLabel: onBack ? (backLabel ?? t("common.back")) : undefined, right: action }}
      heading={{ title, eyebrow, variant: "flow", extra: subtitle && <p className="mt-1.5 text-[15px] leading-snug text-muted">{subtitle}</p> }}
    >
      <div className={dialog ? undefined : "mt-6"}>{children}</div>
    </PageShell>
  );
}
