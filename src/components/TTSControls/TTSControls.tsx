import { useMemo } from "react";
import type { SpeechSettings } from "../../hooks/useSpeechSettings";

type TTSMuteButtonProps = Pick<SpeechSettings, "muted" | "toggleMute" | "openSettings">;

export function TTSMuteButton({ muted, toggleMute, openSettings }: TTSMuteButtonProps) {
  return (
    <div className="bg-neutral-800 rounded-xl p-3 flex items-center gap-2">
      <button
        onClick={toggleMute}
        className="flex-1 text-sm px-3 py-2 rounded-lg text-neutral-300 border border-neutral-600 hover:bg-neutral-700 transition-colors"
      >
        {muted ? "Unmute" : "Mute"}
      </button>
      <button
        onClick={openSettings}
        aria-label="Voice settings"
        className="text-sm px-3 py-2 rounded-lg text-neutral-300 border border-neutral-600 hover:bg-neutral-700 transition-colors"
      >
        Settings
      </button>
    </div>
  );
}

type TTSSettingsModalProps = Pick<
  SpeechSettings,
  "settingsOpen" | "closeSettings" | "voices" | "voiceName" | "setVoiceName" | "rate" | "setRate" | "pitch" | "setPitch" | "speak"
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
}: TTSSettingsModalProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeSettings} />

      <div
        className="relative z-20 w-full max-w-sm rounded-2xl bg-neutral-800 shadow-2xl p-6"
        role="dialog"
        aria-label="Voice Settings"
      >
        <h2 className="text-lg font-bold text-white mb-4">Voice Settings</h2>

        {/* Voice select */}
        <label className="block mb-4">
          <span className="text-sm text-neutral-400 block mb-1">Voice</span>
          <select
            value={voiceName ?? ""}
            onChange={(e) => setVoiceName(e.target.value || null)}
            className="w-full rounded-lg bg-neutral-700 text-neutral-200 text-sm px-3 py-2 border border-neutral-600 focus:outline-none focus:border-blue-500"
          >
            <option value="">System Default</option>
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
          <span className="text-sm text-neutral-400 block mb-1">Rate: {rate.toFixed(1)}</span>
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
          <span className="text-sm text-neutral-400 block mb-1">Pitch: {pitch.toFixed(1)}</span>
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

        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => speak("Testing voice settings")}
            className="flex-1 text-sm px-3 py-2 rounded-lg text-neutral-300 border border-neutral-600 hover:bg-neutral-700 transition-colors"
          >
            Test Voice
          </button>
          <button
            onClick={closeSettings}
            className="flex-1 text-sm px-3 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
