import { ElevenLabsAgentBackend } from "./elevenLabsAgent";
import { OpenAIRealtimeBackend } from "./openaiRealtime";
import { ClaudeNarratorBackend } from "./claudeNarrator";
import type { NarratorBackend, NarratorEngine } from "./types";

export function createNarratorBackend(engine: NarratorEngine): NarratorBackend | null {
  switch (engine) {
    case "elevenlabs-agent":
      return new ElevenLabsAgentBackend();
    case "openai-agent":
      return new OpenAIRealtimeBackend();
    case "claude":
      return new ClaudeNarratorBackend();
    case null:
      return null;
  }
}
