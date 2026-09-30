import { shareOrigin } from "../../lib/shareOrigin";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { Check, Link2, Loader2, Share2, Users } from "lucide-react";
import { TimeoutSelector } from "./TimeoutSelector";
import { RaceModeSelector } from "./RaceModeSelector";
import { FlowPage } from "../Flow";
import { Button, Card, Eyebrow } from "../ui";
import { buildRaceInviteUrl } from "../../lib/shareLinks";
import type { Player, RaceMode } from "../../types/game";

interface GameLobbyProps {
  shareCode: string | null;
  players: Player[];
  isHost: boolean;
  onStartGame: () => void;
  onCloseRoom: () => void;
  onLeave?: () => void;
  wrongAnswerTimeout?: number;
  onWrongAnswerTimeoutChange?: (value: number) => void;
  raceMode?: RaceMode;
  onRaceModeChange?: (value: RaceMode) => void;
}

export function GameLobby({ shareCode, players, isHost, onStartGame, onCloseRoom, onLeave, wrongAnswerTimeout, onWrongAnswerTimeoutChange, raceMode, onRaceModeChange }: GameLobbyProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const flash = (set: (v: boolean) => void) => {
    set(true);
    timers.current.push(window.setTimeout(() => set(false), 2000));
  };

  const handleCopy = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      flash(setCopied);
    } catch {
      // clipboard unavailable (insecure origin / denied) — the code is on screen
    }
  };

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  // Share the rich invite link (unfurls into a per-room OG card — see
  // src/lib/shareLinks.ts). Native share sheet on mobile, clipboard elsewhere.
  const handleShareLink = async () => {
    if (!shareCode) return;
    const url = buildRaceInviteUrl(shareOrigin(), { code: shareCode });
    try {
      if (canShare) {
        await navigator.share({ url });
        return;
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      // fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      flash(setLinkCopied);
    } catch {
      // clipboard unavailable — nothing else to do
    }
  };

  const needMore = players.length < 2;
  const showSettings =
    isHost &&
    ((raceMode !== undefined && onRaceModeChange) || (wrongAnswerTimeout !== undefined && onWrongAnswerTimeoutChange));

  return (
    <FlowPage
      wide
      action={
        isHost ? (
          <Button variant="danger" size="sm" onClick={onCloseRoom}>
            {t("lobby.closeRoom")}
          </Button>
        ) : onLeave ? (
          <Button variant="secondary" size="sm" onClick={onLeave}>
            {t("lobby.leaveLobby")}
          </Button>
        ) : undefined
      }
      title={isHost ? t("lobby.title") : t("lobby.guestTitle")}
      subtitle={isHost ? t("lobby.shareInvite") : t("lobby.guestSubtitle")}
    >
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start lg:gap-x-6">
        {/* Left column: how people get in. */}
        {shareCode && (
          <section className="grid gap-4 lg:row-span-3">
            <Card className="p-5">
              <Eyebrow>{t("lobby.roomCode")}</Eyebrow>
              <button
                type="button"
                onClick={handleCopy}
                className="group mt-3 block w-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
              >
                <span className="sr-only">{shareCode}</span>
                <span aria-hidden="true" className="flex justify-center gap-1.5 sm:gap-2">
                  {shareCode.split("").map((ch, i) => (
                    <span
                      key={i}
                      className="grid aspect-[4/5] min-w-0 max-w-12 flex-1 place-items-center rounded-lg border border-line-strong bg-surface font-mono text-3xl font-bold text-ink shadow-card transition-colors group-active:bg-surface-sunken sm:text-[32px]"
                    >
                      {ch}
                    </span>
                  ))}
                </span>
                <span
                  aria-live="polite"
                  className={`mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold ${copied ? "text-brand-700" : "text-muted"}`}
                >
                  {copied ? <Check className="size-4" aria-hidden="true" /> : null}
                  {copied ? t("lobby.copied") : t("lobby.tapToCopy")}
                </span>
              </button>
              <Button size="lg" block className="mt-4" onClick={handleShareLink}>
                {linkCopied ? (
                  <Check className="size-4.5" aria-hidden="true" />
                ) : canShare ? (
                  <Share2 className="size-4.5" aria-hidden="true" />
                ) : (
                  <Link2 className="size-4.5" aria-hidden="true" />
                )}
                {linkCopied ? t("lobby.inviteLinkCopied") : canShare ? t("lobby.shareInviteAction") : t("lobby.copyInviteLink")}
              </Button>
              {isHost && (
                <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted marker:text-subtle">
                  <li>{t("lobby.howItWorksStep1")}</li>
                  <li>{t("lobby.howItWorksStep2")}</li>
                </ol>
              )}
            </Card>

            <Card className="flex items-center gap-4 p-4 lg:flex-col lg:p-5">
              <div className="w-28 shrink-0 rounded-xl border border-line bg-white p-2 lg:w-48">
                <QRCode
                  value={`${shareOrigin()}/?join=${shareCode}`}
                  size={176}
                  style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                  title={t("lobby.qrCodeLabel")}
                />
              </div>
              <div className="min-w-0 lg:text-center">
                <p className="font-semibold text-ink">{t("lobby.scanToJoin")}</p>
                <p className="mt-0.5 text-sm text-muted">{t("lobby.qrHint")}</p>
              </div>
            </Card>
          </section>
        )}

        {/* Right column: who is here + settings. */}
        <section className={`grid gap-4 ${shareCode ? "" : "lg:col-span-2 lg:mx-auto lg:w-full lg:max-w-md"}`}>
          <Card className="p-5">
            <Eyebrow as="h2">{t("lobby.players", { count: players.length })}</Eyebrow>
            <ul className="mt-3 grid gap-2">
              {players.map((player, i) => (
                <li key={player.userId} className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-sunken px-3.5">
                  <span
                    className="size-3.5 shrink-0 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: player.color }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">{player.displayName}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{t("lobby.host")}</span>
                  )}
                </li>
              ))}
              {needMore && (
                <li className="flex min-h-12 items-center gap-3 rounded-xl border border-dashed border-line-strong px-3.5 text-muted">
                  <Users className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="text-sm">{t("lobby.waitingForPlayers")}</span>
                </li>
              )}
            </ul>
          </Card>

          {showSettings && (
            <Card className="p-5">
              <Eyebrow as="h2">{t("lobby.gameSettings")}</Eyebrow>
              <div className="mt-4 grid gap-5">
                {raceMode !== undefined && onRaceModeChange && (
                  <RaceModeSelector value={raceMode} onChange={onRaceModeChange} />
                )}
                {wrongAnswerTimeout !== undefined && onWrongAnswerTimeoutChange && (
                  <TimeoutSelector value={wrongAnswerTimeout} onChange={onWrongAnswerTimeoutChange} />
                )}
              </div>
            </Card>
          )}

        </section>

        {/* Actions: sticky to the bottom of the viewport on phones, inline on desktop. */}
        <div
          className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur lg:static lg:col-start-2 lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        >
          {isHost ? (
            <Button size="lg" block onClick={onStartGame} disabled={needMore}>
              {needMore ? t("lobby.needMorePlayers", { count: 2 - players.length }) : t("lobby.startGame")}
            </Button>
          ) : (
            <p className="flex min-h-12 items-center justify-center gap-2 text-sm font-medium text-muted" role="status">
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t("lobby.waitingForHost")}
            </p>
          )}
        </div>
      </div>
    </FlowPage>
  );
}
