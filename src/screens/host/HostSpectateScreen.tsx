import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import QRCode from "react-qr-code";
import { CrosswordGrid } from "../../components/CrosswordGrid";
import { CluePanel } from "../../components/CluePanel";
import { TVLayout } from "../../components/Layout/TVLayout";
import { MultiplayerScoreboard } from "../../components/Scoreboard/MultiplayerScoreboard";
import { CompletionModal } from "../../components/CompletionModal";
import { TTSMuteButton, TTSSettingsModal } from "../../components/TTSControls";
import { useHostContext } from "../../layouts/HostLayout";

const NOOP = () => {};

export function HostSpectateScreen() {
  const { t } = useTranslation();
  const host = useHostContext();
  const {
    puzzle,
    playerCells,
    selectedCell,
    highlightedCells,
    totalWhiteCells,
    selectCell,
    multiplayer,
    tts,
    playerColorMap,
    completedClues,
    completedCluesByPlayer,
    multiplayerPlayers,
    playerResults,
    isComplete,
    showCompletionModal,
    joinUrl,
    handleCloseRoom,
    handleNewPuzzle,
    handleBackToMenu,
  } = host;

  if (!puzzle) return <Navigate to="/host" replace />;

  return (
    <>
      <TVLayout
        grid={
          <CrosswordGrid
            puzzle={puzzle}
            playerCells={playerCells}
            selectedCell={selectedCell}
            highlightedCells={highlightedCells}
            onCellClick={selectCell}
            playerColorMap={playerColorMap}
            completedClues={completedClues}
            interactive={false}
          />
        }
        sidebar={
          <div className="bg-neutral-800 rounded-xl p-4 space-y-4">
            <div className="text-center">
              <p className="text-neutral-400 text-xs uppercase tracking-wide mb-1">{t('hostView.roomCode')}</p>
              <p className="font-mono font-bold text-2xl text-white tracking-widest">
                {multiplayer.shareCode}
              </p>
            </div>
            {joinUrl && (
              <div className="flex justify-center">
                <div className="bg-white p-2 rounded-lg">
                  <QRCode value={joinUrl} size={100} title={t('lobby.qrCodeLabel')} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-neutral-400 text-xs uppercase tracking-wide">
                {t('lobby.players', { count: multiplayer.players.length })}
              </p>
              {multiplayer.players.map((player) => (
                <div
                  key={player.userId}
                  className="flex items-center gap-2"
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="text-sm text-neutral-200 truncate">
                    {player.displayName}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={handleCloseRoom}
              className="w-full text-sm px-3 py-2 rounded-lg text-red-400 border border-red-400/30 hover:bg-red-400/10 transition-colors"
            >
              {t('lobby.closeRoom')}
            </button>
          </div>
        }
        scoreboard={
          <div className="bg-white rounded-xl p-5">
            <MultiplayerScoreboard
              players={multiplayerPlayers}
              totalCells={totalWhiteCells}
              isComplete={isComplete}
            />
          </div>
        }
        clues={
          <div className="bg-white rounded-xl p-4 h-full flex flex-col">
            <CluePanel
              clues={puzzle.clues}
              activeClue={null}
              onClueClick={NOOP}
              completedCluesByPlayer={completedCluesByPlayer}
              playerColorMap={playerColorMap}
            />
          </div>
        }
        controls={
          <>
            <TTSMuteButton muted={tts.muted} toggleMute={tts.toggleMute} openSettings={tts.openSettings} />
            <TTSSettingsModal
              settingsOpen={tts.settingsOpen}
              closeSettings={tts.closeSettings}
              voices={tts.voices}
              voiceName={tts.voiceName}
              setVoiceName={tts.setVoiceName}
              rate={tts.rate}
              setRate={tts.setRate}
              pitch={tts.pitch}
              setPitch={tts.setPitch}
              speak={tts.speak}
              engine={tts.engine}
              setEngine={tts.setEngine}
              elevenLabsAvailable={tts.elevenLabsAvailable}
              elevenLabsVoiceId={tts.elevenLabsVoiceId}
              setElevenLabsVoiceId={tts.setElevenLabsVoiceId}
              elevenLabsVoices={tts.elevenLabsVoices}
            />
          </>
        }
      />
      <CompletionModal
        open={showCompletionModal}
        totalCells={totalWhiteCells}
        totalClues={puzzle.clues.length}
        players={playerResults}
        onNewPuzzle={handleNewPuzzle}
        onBackToMenu={handleBackToMenu}
        darkMode
      />
    </>
  );
}
