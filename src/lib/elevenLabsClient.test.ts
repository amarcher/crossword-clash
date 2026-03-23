// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  isElevenLabsAvailable,
  ELEVENLABS_VOICES,
} from "./elevenLabsClient";

describe("ELEVENLABS_VOICES", () => {
  it("has 7 voices", () => {
    expect(ELEVENLABS_VOICES).toHaveLength(7);
  });

  it("each voice has id, name, and description", () => {
    for (const voice of ELEVENLABS_VOICES) {
      expect(voice.id).toBeTruthy();
      expect(voice.name).toBeTruthy();
      expect(voice.description).toBeTruthy();
    }
  });
});

describe("isElevenLabsAvailable", () => {
  it("returns true when VITE_SUPABASE_URL is set", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    expect(isElevenLabsAvailable()).toBe(true);
    vi.unstubAllEnvs();
  });

  it("returns false when VITE_SUPABASE_URL is empty", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    expect(isElevenLabsAvailable()).toBe(false);
    vi.unstubAllEnvs();
  });
});
