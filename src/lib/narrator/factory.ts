import { ElevenLabsAgentBackend } from "./elevenLabsAgent";
import { OpenAIRealtimeBackend } from "./openaiRealtime";
import { ClaudeNarratorBackend } from "./claudeNarrator";
import type { NarratorBackend, NarratorEngine } from "./types";
import type { TTSEngine, ClaudeNarratorOptions } from "./claudeNarrator";

export interface NarratorBackendOptions {
  ttsEngine?: TTSEngine;
  voiceName?: string | null;
  rate?: number;
  pitch?: number;
  elevenLabsVoiceId?: string | null;
}

export function createNarratorBackend(engine: NarratorEngine, options?: NarratorBackendOptions): NarratorBackend | null {
  switch (engine) {
    case "elevenlabs-agent":
      return new ElevenLabsAgentBackend();
    case "openai-agent":
      return new OpenAIRealtimeBackend();
    case "claude":
      return new ClaudeNarratorBackend(options as ClaudeNarratorOptions);
    case null:
      return null;
  }
}
