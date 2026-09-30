import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";

interface TVJoinCardProps {
  code: string | null;
  joinUrl: string | null;
  actions?: ReactNode;
}

/** Always-visible corner card during the game so late joiners can still join. */
export function TVJoinCard({ code, joinUrl, actions }: TVJoinCardProps) {
  const { t } = useTranslation();
  return (
    <div className="tv-card flex items-center tv-gap" style={{ padding: "calc(var(--u) * 1)" }}>
      {joinUrl && (
        <div
          className="shrink-0 rounded-lg bg-white"
          style={{ padding: "calc(var(--u) * 0.5)", width: "calc(var(--u) * 7)", height: "calc(var(--u) * 7)" }}
        >
          <QRCode value={joinUrl} title={t("lobby.qrCodeLabel")} style={{ width: "100%", height: "100%" }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="tv-t-sm font-semibold uppercase tracking-[0.12em] text-slate-400">{t("hostView.roomCode")}</p>
        <p data-testid="room-code" className="tv-code-sm font-mono font-bold tabular-nums text-gold-400">{code}</p>
        <p className="tv-t-sm text-slate-400">{t("tv.joinAt")}</p>
      </div>
      {actions}
    </div>
  );
}
