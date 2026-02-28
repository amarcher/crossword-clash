import { useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { Title } from "../Title";
import { TimeoutSelector } from "./TimeoutSelector";
import type { Player } from "../../types/game";

interface GameLobbyProps {
  shareCode: string | null;
  players: Player[];
  isHost: boolean;
  onStartGame: () => void;
  onCloseRoom: () => void;
  wrongAnswerTimeout?: number;
  onWrongAnswerTimeoutChange?: (value: number) => void;
}

export function GameLobby({ shareCode, players, isHost, onStartGame, onCloseRoom, wrongAnswerTimeout, onWrongAnswerTimeoutChange }: GameLobbyProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!shareCode) return;
    await navigator.clipboard.writeText(shareCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-50 p-8 overflow-auto">
      <Title className="mb-2" />
      <p className="text-neutral-500 mb-8">{t('lobby.shareInvite')}</p>

      {shareCode && (
        <>
          <button
            onClick={handleCopy}
            className="mb-6 px-8 py-4 bg-white border-2 border-neutral-200 rounded-xl hover:border-neutral-300 transition-colors"
          >
            <span className="text-4xl font-mono font-bold tracking-[0.3em] text-neutral-800">
              {shareCode}
            </span>
            <p className="text-xs text-neutral-400 mt-1">
              {copied ? t('lobby.copied') : t('lobby.clickToCopy')}
            </p>
          </button>

          <div className="mb-8 flex flex-col items-center">
            <div className="p-4 bg-white rounded-xl border border-neutral-200">
              <QRCode
                value={`${window.location.origin}${window.location.pathname}?join=${shareCode}`}
                size={200}
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
          {wrongAnswerTimeout !== undefined && onWrongAnswerTimeoutChange && (
            <TimeoutSelector value={wrongAnswerTimeout} onChange={onWrongAnswerTimeoutChange} />
          )}
          <button
            onClick={onStartGame}
            disabled={players.length < 2}
            className="px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
          >
            {players.length < 2 ? t('lobby.waitingForPlayers') : t('lobby.startGame')}
          </button>
          <button
            onClick={onCloseRoom}
            className="text-sm text-red-500 hover:text-red-700 transition-colors"
          >
            {t('lobby.closeRoom')}
          </button>
        </div>
      )}

      {!isHost && (
        <p className="text-neutral-500 text-sm">{t('lobby.waitingForHost')}</p>
      )}
    </div>
  );
}
