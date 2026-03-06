/**
 * TTS settings persistence via localStorage.
 * Stores voice, rate, pitch, and mute preferences for TV view announcements.
 */

import type { NarratorEngine } from "./narrator/types";

const TTS_STORAGE_KEY = "crossword-clash-tts";

export type TTSEngine = "browser" | "elevenlabs";

export interface TTSSettings {
  muted: boolean;
  voiceName: string | null; // null = browser default
  rate: number; // 0.5–2.0, default 1.0
  pitch: number; // 0.5–2.0, default 1.0
  engine: TTSEngine;
  elevenLabsVoiceId: string | null; // null = default (Rachel)
  narratorEngine: NarratorEngine; // null = no narrator (use per-clue TTS)
}

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  muted: false,
  voiceName: null,
  rate: 1.0,
  pitch: 1.0,
  engine: "browser",
  elevenLabsVoiceId: null,
  narratorEngine: null,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const VALID_NARRATOR_ENGINES = new Set(["elevenlabs-agent", "openai-agent", "claude"]);

export function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(TTS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TTS_SETTINGS };
    const parsed = JSON.parse(raw);

    // Migrate: old "agent" engine → narratorEngine "elevenlabs-agent"
    let engine: TTSEngine = "browser";
    let narratorEngine: NarratorEngine = null;

    if (parsed.engine === "elevenlabs") {
      engine = "elevenlabs";
    } else if (parsed.engine === "agent") {
      // Legacy: "agent" was the old ElevenLabs agent narrator conflated with TTS engine
      engine = "browser";
      narratorEngine = "elevenlabs-agent";
    }

    // Explicit narratorEngine overrides the migration
    if (typeof parsed.narratorEngine === "string" && VALID_NARRATOR_ENGINES.has(parsed.narratorEngine)) {
      narratorEngine = parsed.narratorEngine as NarratorEngine;
    } else if (parsed.narratorEngine === null) {
      // Only use migration value if narratorEngine wasn't explicitly set
      // (migration already set it above for "agent" engine)
    }

    return {
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_TTS_SETTINGS.muted,
      voiceName: typeof parsed.voiceName === "string" ? parsed.voiceName : null,
      rate: typeof parsed.rate === "number" ? clamp(parsed.rate, 0.5, 2.0) : DEFAULT_TTS_SETTINGS.rate,
      pitch: typeof parsed.pitch === "number" ? clamp(parsed.pitch, 0.5, 2.0) : DEFAULT_TTS_SETTINGS.pitch,
      engine,
      elevenLabsVoiceId: typeof parsed.elevenLabsVoiceId === "string" ? parsed.elevenLabsVoiceId : null,
      narratorEngine,
    };
  } catch {
    return { ...DEFAULT_TTS_SETTINGS };
  }
}

export function saveTTSSettings(settings: TTSSettings): void {
  localStorage.setItem(TTS_STORAGE_KEY, JSON.stringify(settings));
}

export type { NarratorEngine };
