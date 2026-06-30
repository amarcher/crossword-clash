import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import QRCode from "react-qr-code";
import { CrosswordGrid } from "../../components/CrosswordGrid";
import { CluePanel } from "../../components/CluePanel";
import { TVLayout } from "../../components/Layout/TVLayout";
import { MultiplayerScoreboard } from "../../components/Scoreboard/MultiplayerScoreboard";
import { CompletionModal } from "../../components/CompletionModal";
import { TTSMuteButton, TTSSettingsModal } from "../../components/TTSControls";
import { useBeforeUnload } from "../../hooks/useBeforeUnload";
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
    clueCountsByPlayer,
    multiplayerPlayers,
    playerResults,
    isComplete,
    showCompletionModal,
    joinUrl,
    handleCloseRoom,
    handleNewPuzzle,
    handleRematch,
    handleBackToMenu,
    narrator,
  } = host;

  useBeforeUnload(multiplayer.gameStatus === "active");

  // Show a transient banner when the narrator falls back to another backend.
  // Auto-dismisses after 8s; the user can click to dismiss sooner.
  const [bannerHidden, setBannerHidden] = useState(false);
  // Budget cap reached (and any demo spent): the narrator is intentionally
  // paused. Distinguish this from an all-backends-failed exhaustion so we can
  // show a friendly "taking a break" message rather than an error.
  const budgetPaused = narrator.budgetExhausted;
  const fellBack =
    !budgetPaused &&
    narrator.requestedEngine !== null &&
    narrator.currentEngine !== narrator.requestedEngine;
  const exhausted =
    !budgetPaused &&
    narrator.requestedEngine !== null &&
    narrator.currentEngine === null;
  useEffect(() => {
    if (!fellBack && !exhausted && !budgetPaused) return;
    setBannerHidden(false);
    const timer = setTimeout(() => setBannerHidden(true), 8000);
    return () => clearTimeout(timer);
  }, [fellBack, exhausted, budgetPaused, narrator.currentEngine]);

  if (!puzzle) return <Navigate to="/host" replace />;

  if (host.multiplayer.gameStatus === "waiting" && host.multiplayer.hydrated && host.gameId) {
    return <Navigate to={`/host/lobby/${host.gameId}`} replace />;
  }

  const showFallbackBanner = (fellBack || exhausted || budgetPaused) && !bannerHidden;
  const fallbackMessage = budgetPaused
    ? t("tts.narratorBudgetPaused")
    : exhausted
      ? t("tts.fallbackExhausted")
      : t("tts.fallbackSwitched", {
          engine: narrator.currentEngine ?? "",
          from: narrator.requestedEngine ?? "",
        });

  return (
    <>
      {showFallbackBanner && (
        <button
          type="button"
          onClick={() => setBannerHidden(true)}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-amber-500/95 text-white text-sm shadow-lg hover:bg-amber-600 transition-colors"
        >
          {fallbackMessage}
        </button>
      )}
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
              <p className="font-mono font-bold text-4xl text-white tracking-widest">
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
                  <span className="text-lg text-neutral-200 truncate">
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
              clueCountsByPlayer={clueCountsByPlayer}
              totalClues={puzzle.clues.length}
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
              narratorEngine={tts.narratorEngine}
              setNarratorEngine={tts.setNarratorEngine}
              spokenEvents={tts.spokenEvents}
              setSpokenEvents={tts.setSpokenEvents}
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
        puzzleTitle={puzzle.title}
        totalCells={totalWhiteCells}
        totalClues={puzzle.clues.length}
        players={playerResults}
        onRematch={handleRematch}
        onNewPuzzle={handleNewPuzzle}
        onBackToMenu={handleBackToMenu}
        darkMode
      />
    </>
  );
}
