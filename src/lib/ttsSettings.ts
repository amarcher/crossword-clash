/**
 * TTS settings persistence via localStorage.
 * Stores voice, rate, pitch, and mute preferences for TV view announcements.
 */

const TTS_STORAGE_KEY = "crossword-clash-tts";

export interface TTSSettings {
  muted: boolean;
  voiceName: string | null; // null = browser default
  rate: number; // 0.5–2.0, default 1.0
  pitch: number; // 0.5–2.0, default 1.0
}

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  muted: false,
  voiceName: null,
  rate: 1.0,
  pitch: 1.0,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(TTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TTS_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_TTS_SETTINGS.muted,
      voiceName: typeof parsed.voiceName === "string" ? parsed.voiceName : null,
      rate: typeof parsed.rate === "number" ? clamp(parsed.rate, 0.5, 2.0) : DEFAULT_TTS_SETTINGS.rate,
      pitch: typeof parsed.pitch === "number" ? clamp(parsed.pitch, 0.5, 2.0) : DEFAULT_TTS_SETTINGS.pitch,
    };
  } catch {
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

export function saveTTSSettings(settings: TTSSettings): void {
  localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(settings));
}
