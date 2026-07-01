import { useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { Title } from "../Title";
import { TimeoutSelector } from "./TimeoutSelector";
import { RaceModeSelector } from "./RaceModeSelector";
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

  const handleCopy = async () => {
    if (!shareCode) return;
    await navigator.clipboard.writeText(shareCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Share the rich invite link (unfurls into a per-room OG card — see
  // src/lib/shareLinks.ts). Native share sheet on mobile, clipboard elsewhere.
  const handleShareLink = async () => {
    if (!shareCode) return;
    const url = buildRaceInviteUrl(window.location.origin, { code: shareCode });
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ url });
        return;
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      // fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing else to do
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-dvh crossword-bg p-8 overflow-auto">
      <Title className="mb-2" />
      <p className="text-neutral-500 mb-8">{t('lobby.shareInvite')}</p>

      {shareCode && (
        <>
          <button
            onClick={handleCopy}
            className="mb-6 px-8 py-4 bg-white border-2 border-neutral-200 rounded-xl hover:border-neutral-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <span className="text-4xl font-mono font-bold tracking-[0.3em] text-neutral-800">
              {shareCode}
            </span>
            <p className="text-xs text-neutral-400 mt-1">
              {copied ? t('lobby.copied') : t('lobby.clickToCopy')}
            </p>
          </button>

          <button
            onClick={handleShareLink}
            className="mb-6 -mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {linkCopied ? t('lobby.inviteLinkCopied') : `🔗 ${t('lobby.copyInviteLink')}`}
          </button>

          <div className="mb-8 flex flex-col items-center">
            <div className="p-4 bg-white rounded-xl border border-neutral-200">
              <QRCode
                value={`${window.location.origin}${window.location.pathname}?join=${shareCode}`}
                size={200}
                title={t('lobby.qrCodeLabel')}
              />
            </div>
            <p className="text-xs text-neutral-400 mt-2">{t('lobby.scanToJoin')}</p>
          </div>
        </>
      )}

      <div className="w-full max-w-sm mb-8">
        <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-3">
          {t('lobby.players', { count: players.length })}
        </h2>
        <div className="space-y-2">
          {players.map((player, i) => (
            <div
              key={player.userId}
              className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-neutral-200"
            >
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: player.color }}
              />
              <span className="font-medium text-neutral-700">
                {player.displayName}
              </span>
              {i === 0 && (
                <span className="text-xs text-neutral-400 ml-auto">{t('lobby.host')}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {isHost && (
        <div className="flex flex-col items-center gap-4">
          {raceMode !== undefined && onRaceModeChange && (
            <RaceModeSelector value={raceMode} onChange={onRaceModeChange} />
          )}
          {wrongAnswerTimeout !== undefined && onWrongAnswerTimeoutChange && (
            <TimeoutSelector value={wrongAnswerTimeout} onChange={onWrongAnswerTimeoutChange} />
          )}
          <button
            onClick={onStartGame}
            disabled={players.length < 2}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {players.length < 2
              ? t('lobby.needMorePlayers', { count: 2 - players.length })
              : t('lobby.startGame')}
          </button>
          <button
            onClick={onCloseRoom}
            className="text-sm text-red-500 hover:text-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 rounded"
          >
            {t('lobby.closeRoom')}
          </button>
        </div>
      )}

      {!isHost && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-neutral-500 text-sm">{t('lobby.waitingForHost')}</p>
          {onLeave && (
            <button
              onClick={onLeave}
              className="text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              {t('lobby.leaveLobby')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
