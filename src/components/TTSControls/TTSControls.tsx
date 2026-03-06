import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SpeechSettings } from "../../hooks/useSpeechSettings";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { NarratorEngine } from "../../lib/ttsSettings";

type TTSMuteButtonProps = Pick<SpeechSettings, "muted" | "toggleMute" | "openSettings">;

export function TTSMuteButton({ muted, toggleMute, openSettings }: TTSMuteButtonProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-neutral-800 rounded-xl p-3 flex items-center gap-2">
      <button
        onClick={toggleMute}
        className="flex-1 text-sm px-3 py-2 rounded-lg text-neutral-300 border border-neutral-600 hover:bg-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-800"
      >
        {muted ? t('tts.unmute') : t('tts.mute')}
      </button>
      <button
        onClick={openSettings}
        aria-label={t('tts.settingsAriaLabel')}
        className="text-sm px-3 py-2 rounded-lg text-neutral-300 border border-neutral-600 hover:bg-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-800"
      >
        {t('tts.settings')}
      </button>
    </div>
  );
}

type TTSSettingsModalProps = Pick<
  SpeechSettings,
  | "settingsOpen"
  | "closeSettings"
  | "voices"
  | "voiceName"
  | "setVoiceName"
  | "rate"
  | "setRate"
  | "pitch"
  | "setPitch"
  | "speak"
  | "engine"
  | "setEngine"
  | "narratorEngine"
  | "setNarratorEngine"
  | "elevenLabsAvailable"
  | "elevenLabsVoiceId"
  | "setElevenLabsVoiceId"
  | "elevenLabsVoices"
>;

export function TTSSettingsModal({
  settingsOpen,
  closeSettings,
  voices,
  voiceName,
  setVoiceName,
  rate,
  setRate,
  pitch,
  setPitch,
  speak,
  engine,
  setEngine,
  narratorEngine,
  setNarratorEngine,
  elevenLabsAvailable,
  elevenLabsVoiceId,
  setElevenLabsVoiceId,
  elevenLabsVoices,
}: TTSSettingsModalProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement | null>(null);

  const handleEscape = useCallback(() => {
    closeSettings();
  }, [closeSettings]);

  useFocusTrap(settingsOpen ? modalRef : { current: null }, handleEscape);

  const groupedVoices = useMemo(() => {
    const groups = new Map<string, SpeechSynthesisVoice[]>();
    for (const voice of voices) {
      const lang = voice.lang;
      if (!groups.has(lang)) groups.set(lang, []);
      groups.get(lang)!.push(voice);
    }
    return groups;
  }, [voices]);

  if (!settingsOpen) return null;

  const hasNarrator = narratorEngine !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeSettings} />

      <div
        ref={modalRef}
        className="relative z-20 w-full max-w-sm rounded-2xl bg-neutral-800 shadow-2xl p-6"
        role="dialog"
        aria-modal="true"
        aria-label={t('tts.voiceSettings')}
      >
        <h2 className="text-lg font-bold text-white mb-4">{t('tts.voiceSettings')}</h2>

        {/* Narrator engine selector — only shown when ElevenLabs gate is set */}
        {elevenLabsAvailable && (
          <label className="block mb-4">
            <span className="text-sm text-neutral-400 block mb-1">{t('tts.narratorLabel')}</span>
            <select
              value={narratorEngine ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setNarratorEngine(val === "" ? null : val as NarratorEngine);
              }}
              className="w-full rounded-lg bg-neutral-700 text-neutral-200 text-sm px-3 py-2 border border-neutral-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="">{t('tts.narratorNone')}</option>
              <option value="elevenlabs-agent">{t('tts.narratorElevenLabs')}</option>
              <option value="openai-agent">{t('tts.narratorOpenAI')}</option>
              <option value="claude">{t('tts.narratorClaude')}</option>
            </select>
          </label>
        )}

        {/* Narrator description */}
        {hasNarrator && elevenLabsAvailable && (
          <p className="text-xs text-neutral-400 mb-4">
            {narratorEngine === "elevenlabs-agent" && t('tts.narratorElevenLabsDesc')}
            {narratorEngine === "openai-agent" && t('tts.narratorOpenAIDesc')}
            {narratorEngine === "claude" && t('tts.narratorClaudeDesc')}
          </p>
        )}

        {/* TTS voice controls — only shown when narrator is NOT active (Claude narrator uses its own TTS) */}
        {(!hasNarrator || narratorEngine === "claude") && (
          <>
            {/* Engine toggle — only shown when ElevenLabs gate is set and no agent narrator (Claude narrator also uses TTS) */}
            {elevenLabsAvailable && (!hasNarrator || narratorEngine === "claude") && (
              <label className="block mb-4">
                <span className="text-sm text-neutral-400 block mb-1">{t('tts.engineLabel')}</span>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as "browser" | "elevenlabs")}
                  className="w-full rounded-lg bg-neutral-700 text-neutral-200 text-sm px-3 py-2 border border-neutral-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="browser">{t('tts.engineBrowser')}</option>
                  <option value="elevenlabs">{t('tts.engineElevenLabs')}</option>
                </select>
              </label>
            )}

            {engine === "elevenlabs" && elevenLabsAvailable ? (
              /* ElevenLabs voice select */
              <label className="block mb-4">
                <span className="text-sm text-neutral-400 block mb-1">{t('tts.elevenLabsVoice')}</span>
                <select
                  value={elevenLabsVoiceId ?? ""}
                  onChange={(e) => setElevenLabsVoiceId(e.target.value || null)}
                  className="w-full rounded-lg bg-neutral-700 text-neutral-200 text-sm px-3 py-2 border border-neutral-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <option value="">Rachel (default)</option>
                  {elevenLabsVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} — {v.description}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                {/* Browser voice select */}
                <label className="block mb-4">
                  <span className="text-sm text-neutral-400 block mb-1">{t('tts.voice')}</span>
                  <select
                    value={voiceName ?? ""}
                    onChange={(e) => setVoiceName(e.target.value || null)}
                    className="w-full rounded-lg bg-neutral-700 text-neutral-200 text-sm px-3 py-2 border border-neutral-600 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <option value="">{t('tts.systemDefault')}</option>
                    {[...groupedVoices.entries()].map(([lang, langVoices]) => (
                      <optgroup key={lang} label={lang}>
                        {langVoices.map((v) => (
                          <option key={v.name} value={v.name}>
                            {v.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                {/* Rate slider */}
                <label className="block mb-4">
                  <span className="text-sm text-neutral-400 block mb-1">{t('tts.rate', { value: rate.toFixed(1) })}</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </label>

                {/* Pitch slider */}
                <label className="block mb-4">
                  <span className="text-sm text-neutral-400 block mb-1">{t('tts.pitch', { value: pitch.toFixed(1) })}</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </label>
              </>
            )}
          </>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          {/* Test Voice — hidden for agent narrators that handle their own audio */}
          {narratorEngine !== "elevenlabs-agent" && narratorEngine !== "openai-agent" && (
            <button
              onClick={() => speak(t('tts.testText'))}
              className="flex-1 text-sm px-3 py-2 rounded-lg text-neutral-300 border border-neutral-600 hover:bg-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-800"
            >
              {t('tts.testVoice')}
            </button>
          )}
          <button
            onClick={closeSettings}
            className="flex-1 text-sm px-3 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-800"
          >
            {t('tts.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
