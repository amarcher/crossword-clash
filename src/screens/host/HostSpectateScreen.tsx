import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router";
import { X } from "lucide-react";
import { CrosswordGrid } from "../../components/CrosswordGrid";
import { TVLayout } from "../../components/Layout/TVLayout";
import { TVCluePanel } from "../../components/Layout/TVCluePanel";
import { TVJoinCard } from "../../components/Layout/TVJoinCard";
import { TVScoreboard } from "../../components/Layout/TVScoreboard";
import { buttonClass } from "../../components/ui";
import { CompletionModal } from "../../components/CompletionModal";
import { TTSMuteButton, TTSSettingsModal } from "../../components/TTSControls";
import { useBeforeUnload } from "../../hooks/useBeforeUnload";
import { useHostContext } from "../../layouts/HostLayout";

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
          className="tv-t-md fixed top-3 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-gold-500/50 bg-stage-raised px-5 py-3 font-semibold text-gold-400 shadow-overlay transition-colors hover:bg-stage-line"
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
          <TVJoinCard
            code={multiplayer.shareCode}
            joinUrl={joinUrl}
            actions={
              <button
                type="button"
                onClick={handleCloseRoom}
                className={buttonClass("stage", "md", "tv-t-sm h-auto! shrink-0 self-start py-2")}
              >
                <X className="size-[1.3em]" aria-hidden />
                {t('lobby.closeRoom')}
              </button>
            }
          />
        }
        scoreboard={
          <TVScoreboard
            players={multiplayerPlayers}
            totalCells={totalWhiteCells}
            isComplete={isComplete}
            clueCountsByPlayer={clueCountsByPlayer}
            totalClues={puzzle.clues.length}
          />
        }
        clues={
          <TVCluePanel
            clues={puzzle.clues}
            completedClues={completedClues}
            completedCluesByPlayer={completedCluesByPlayer}
            playerColorMap={playerColorMap}
          />
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
