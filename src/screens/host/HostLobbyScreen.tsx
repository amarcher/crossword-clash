import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import QRCode from "react-qr-code";
import { Title } from "../../components/Title";
import { TimeoutSelector } from "../../components/GameLobby";
import { useHostContext } from "../../layouts/HostLayout";

export function HostLobbyScreen() {
  const { t } = useTranslation();
  const host = useHostContext();
  const { multiplayer, joinUrl, wrongAnswerTimeout, setWrongAnswerTimeout, handleStartGame, handleCloseRoom } = host;

  if (!host.puzzle) return <Navigate to="/host" replace />;

  return (
    <div className="flex flex-col items-center justify-center h-dvh bg-neutral-900 p-8 gap-8">
      <Title variant="dark" />
      <p className="text-2xl font-semibold text-white -mt-4">{t('lobby.waitingForPlayersTitle')}</p>

      {joinUrl && (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-xl">
            <QRCode value={joinUrl} size={200} title={t('lobby.qrCodeLabel')} />
          </div>
          <div className="text-center">
            <p className="text-neutral-400 text-sm mb-1">{t('hostView.roomCode')}</p>
            <p className="font-mono font-bold text-4xl text-white tracking-widest">
              {multiplayer.shareCode}
            </p>
          </div>
        </div>
      )}

      <div className="w-full max-w-xs space-y-2">
        <p className="text-neutral-400 text-sm text-center">
          {t('lobby.players', { count: multiplayer.players.length })}
        </p>
        {multiplayer.players.map((player) => (
          <div
            key={player.userId}
            className="flex items-center gap-3 px-4 py-2 bg-neutral-800 rounded-lg"
          >
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: player.color }}
            />
            <span className="text-white font-medium truncate">
              {player.displayName}
            </span>
          </div>
        ))}
      </div>

      <TimeoutSelector value={wrongAnswerTimeout} onChange={setWrongAnswerTimeout} variant="dark" />

      <div className="flex gap-3">
        <button
          onClick={handleStartGame}
          disabled={multiplayer.players.length < 2}
          className="px-8 py-3 rounded-lg font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 disabled:cursor-not-allowed transition-colors"
        >
          {t('lobby.startGame')}
        </button>
        <button
          onClick={handleCloseRoom}
          className="px-6 py-3 rounded-lg font-semibold text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
        >
          {t('lobby.closeRoom')}
        </button>
      </div>
    </div>
  );
}
