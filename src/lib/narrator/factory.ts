import { ClaudeNarratorBackend } from "./claudeNarrator";
import type { NarratorBackend, NarratorEngine } from "./types";
import type { TTSEngine, ClaudeNarratorOptions } from "./claudeNarrator";

export interface NarratorBackendOptions {
  ttsEngine?: TTSEngine;
  voiceName?: string | null;
  rate?: number;
  pitch?: number;
  elevenLabsVoiceId?: string | null;
  gameId?: string | null;
}

export function createNarratorBackend(engine: NarratorEngine, options?: NarratorBackendOptions): NarratorBackend | null {
  return engine === "claude" ? new ClaudeNarratorBackend(options as ClaudeNarratorOptions) : null;
}
