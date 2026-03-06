import { ElevenLabsAgentBackend } from "./elevenLabsAgent";
import { OpenAIRealtimeBackend } from "./openaiRealtime";
import { ClaudeNarratorBackend } from "./claudeNarrator";
import type { NarratorBackend, NarratorEngine } from "./types";
import type { TTSEngine } from "./claudeNarrator";

export interface NarratorBackendOptions {
  ttsEngine?: TTSEngine;
}

export function createNarratorBackend(engine: NarratorEngine, options?: NarratorBackendOptions): NarratorBackend | null {
  switch (engine) {
    case "elevenlabs-agent":
      return new ElevenLabsAgentBackend();
    case "openai-agent":
      return new OpenAIRealtimeBackend();
    case "claude":
      return new ClaudeNarratorBackend({ ttsEngine: options?.ttsEngine });
    case null:
      return null;
  }
}
