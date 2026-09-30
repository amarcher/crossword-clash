import { useCallback, useMemo, useRef } from "react";
import { Settings, Volume2, VolumeX } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SpeechSettings } from "../../hooks/useSpeechSettings";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { track } from "../../lib/analytics";
import type { NarratorEngine } from "../../lib/ttsSettings";

type TTSMuteButtonProps = Pick<SpeechSettings, "muted" | "toggleMute" | "openSettings">;

export function TTSMuteButton({ muted, toggleMute, openSettings }: TTSMuteButtonProps) {
  const { t } = useTranslation();

  const btn =
    "tv-t-sm inline-flex min-h-11 items-center gap-2 rounded-xl border border-stage-line bg-stage-raised px-4 py-2 font-semibold text-slate-100 transition-colors hover:bg-stage-line active:bg-stage-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

  return (
    <div className="flex items-center gap-2">
      <button onClick={toggleMute} className={btn}>
        {muted ? <VolumeX className="size-[1.3em]" aria-hidden /> : <Volume2 className="size-[1.3em]" aria-hidden />}
        {muted ? t('tts.unmute') : t('tts.mute')}
      </button>
      <button onClick={openSettings} aria-label={t('tts.settingsAriaLabel')} className={btn}>
        <Settings className="size-[1.3em]" aria-hidden />
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
  | "spokenEvents"
  | "setSpokenEvents"
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
  spokenEvents,
  setSpokenEvents,
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
        className="relative z-20 w-full max-w-sm rounded-2xl border border-stage-line bg-stage-raised shadow-overlay p-6 text-white"
        role="dialog"
        aria-modal="true"
        aria-label={t('tts.voiceSettings')}
      >
        <h2 className="text-lg font-bold text-white mb-4">{t('tts.voiceSettings')}</h2>

        {/* Narrator engine selector — only shown when ElevenLabs gate is set */}
        {elevenLabsAvailable && (
          <label className="block mb-4">
            <span className="text-sm text-slate-400 block mb-1">{t('tts.narratorLabel')}</span>
            <select
              value={narratorEngine ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                const next = val === "" ? null : (val as NarratorEngine);
                if (next) track("narrator_enabled", { engine: next });
                setNarratorEngine(next);
              }}
              className="w-full rounded-lg bg-stage text-slate-100 text-sm px-3 py-2 border border-stage-line focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500"
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
          <p className="text-xs text-slate-400 mb-4">
            {narratorEngine === "elevenlabs-agent" && t('tts.narratorElevenLabsDesc')}
            {narratorEngine === "openai-agent" && t('tts.narratorOpenAIDesc')}
            {narratorEngine === "claude" && t('tts.narratorClaudeDesc')}
          </p>
        )}

        {/* Per-clue announcer toggle — only meaningful when no AI narrator
            is active (the narrator already handles commentary). */}
        {!hasNarrator && (
          <label className="flex items-start gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={spokenEvents}
              onChange={(e) => setSpokenEvents(e.target.checked)}
              className="mt-1 accent-brand-500"
            />
            <span>
              <span className="text-sm text-slate-100 block">
                {t("tts.spokenEvents")}
              </span>
              <span className="text-xs text-slate-400 block">
                {t("tts.spokenEventsHint")}
              </span>
            </span>
          </label>
        )}

        {/* TTS voice controls — only shown when narrator is NOT active (Claude narrator uses its own TTS) */}
        {(!hasNarrator || narratorEngine === "claude") && (
          <>
            {/* Engine toggle — only shown when ElevenLabs gate is set and no agent narrator (Claude narrator also uses TTS) */}
            {elevenLabsAvailable && (!hasNarrator || narratorEngine === "claude") && (
              <label className="block mb-4">
                <span className="text-sm text-slate-400 block mb-1">{t('tts.engineLabel')}</span>
                <select
                  value={engine}
                  onChange={(e) => setEngine(e.target.value as "browser" | "elevenlabs")}
                  className="w-full rounded-lg bg-stage text-slate-100 text-sm px-3 py-2 border border-stage-line focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <option value="browser">{t('tts.engineBrowser')}</option>
                  <option value="elevenlabs">{t('tts.engineElevenLabs')}</option>
                </select>
              </label>
            )}

            {engine === "elevenlabs" && elevenLabsAvailable ? (
              /* ElevenLabs voice select */
              <label className="block mb-4">
                <span className="text-sm text-slate-400 block mb-1">{t('tts.elevenLabsVoice')}</span>
                <select
                  value={elevenLabsVoiceId ?? ""}
                  onChange={(e) => setElevenLabsVoiceId(e.target.value || null)}
                  className="w-full rounded-lg bg-stage text-slate-100 text-sm px-3 py-2 border border-stage-line focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500"
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
                  <span className="text-sm text-slate-400 block mb-1">{t('tts.voice')}</span>
                  <select
                    value={voiceName ?? ""}
                    onChange={(e) => setVoiceName(e.target.value || null)}
                    className="w-full rounded-lg bg-stage text-slate-100 text-sm px-3 py-2 border border-stage-line focus-visible:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500"
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
                  <span className="text-sm text-slate-400 block mb-1">{t('tts.rate', { value: rate.toFixed(1) })}</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={rate}
                    onChange={(e) => setRate(parseFloat(e.target.value))}
                    className="w-full accent-brand-500"
                  />
                </label>

                {/* Pitch slider */}
                <label className="block mb-4">
                  <span className="text-sm text-slate-400 block mb-1">{t('tts.pitch', { value: pitch.toFixed(1) })}</span>
                  <input
                    type="range"
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-brand-500"
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
              className="flex-1 text-sm px-3 py-2 rounded-lg text-slate-200 border border-stage-line hover:bg-stage transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stage-raised"
            >
              {t('tts.testVoice')}
            </button>
          )}
          <button
            onClick={closeSettings}
            className="flex-1 text-sm px-3 py-2 rounded-lg font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stage-raised"
          >
            {t('tts.done')}
          </button>
        </div>
      </div>
    </div>
  );
}
