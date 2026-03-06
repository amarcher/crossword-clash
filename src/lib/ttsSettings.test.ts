// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadTTSSettings,
  saveTTSSettings,
  DEFAULT_TTS_SETTINGS,
} from "./ttsSettings";
import type { TTSSettings } from "./ttsSettings";

beforeEach(() => {
  localStorage.clear();
});

describe("TTS settings persistence", () => {
  it("returns defaults when no settings are stored", () => {
    expect(loadTTSSettings()).toEqual(DEFAULT_TTS_SETTINGS);
  });

  it("round-trips settings through save/load", () => {
    const settings: TTSSettings = {
      muted: true,
      voiceName: "Google UK English Male",
      rate: 1.5,
      pitch: 0.8,
      engine: "browser",
      elevenLabsVoiceId: null,
      narratorEngine: null,
    };
    saveTTSSettings(settings);
    expect(loadTTSSettings()).toEqual(settings);
  });

  it("handles null voiceName", () => {
    const settings: TTSSettings = { ...DEFAULT_TTS_SETTINGS, voiceName: null };
    saveTTSSettings(settings);
    expect(loadTTSSettings()).toEqual(settings);
  });

  it("returns defaults for corrupted JSON", () => {
    localStorage.setItem("crossword-clash-tts", "not json{{{");
    expect(loadTTSSettings()).toEqual(DEFAULT_TTS_SETTINGS);
  });

  it("returns defaults for empty object", () => {
    localStorage.setItem("crossword-clash-tts", JSON.stringify({}));
    expect(loadTTSSettings()).toEqual(DEFAULT_TTS_SETTINGS);
  });

  it("clamps rate below minimum to 0.5", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS, rate: 0.1 });
    expect(loadTTSSettings().rate).toBe(0.5);
  });

  it("clamps rate above maximum to 2.0", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS, rate: 5.0 });
    expect(loadTTSSettings().rate).toBe(2.0);
  });

  it("clamps pitch below minimum to 0.5", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS, pitch: -1 });
    expect(loadTTSSettings().pitch).toBe(0.5);
  });

  it("clamps pitch above maximum to 2.0", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS, pitch: 3.0 });
    expect(loadTTSSettings().pitch).toBe(2.0);
  });

  it("uses default for non-boolean muted", () => {
    localStorage.setItem(
      "crossword-clash-tts",
      JSON.stringify({ muted: "yes", rate: 1.0, pitch: 1.0 }),
    );
    expect(loadTTSSettings().muted).toBe(false);
  });

  it("uses null for non-string voiceName", () => {
    localStorage.setItem(
      "crossword-clash-tts",
      JSON.stringify({ voiceName: 42 }),
    );
    expect(loadTTSSettings().voiceName).toBeNull();
  });

  it("defaults engine to browser when not set", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS });
    // Simulate old settings without engine field
    const raw = JSON.parse(localStorage.getItem("crossword-clash-tts")!);
    delete raw.engine;
    localStorage.setItem("crossword-clash-tts", JSON.stringify(raw));
    expect(loadTTSSettings().engine).toBe("browser");
  });

  it("loads engine elevenlabs when saved", () => {
    const settings: TTSSettings = { ...DEFAULT_TTS_SETTINGS, engine: "elevenlabs" };
    saveTTSSettings(settings);
    expect(loadTTSSettings().engine).toBe("elevenlabs");
  });

  it("migrates legacy engine agent to narratorEngine elevenlabs-agent", () => {
    // Simulate old settings with engine: "agent"
    localStorage.setItem(
      "crossword-clash-tts",
      JSON.stringify({ ...DEFAULT_TTS_SETTINGS, engine: "agent" }),
    );
    const loaded = loadTTSSettings();
    expect(loaded.engine).toBe("browser");
    expect(loaded.narratorEngine).toBe("elevenlabs-agent");
  });

  it("defaults engine to browser for unknown value", () => {
    localStorage.setItem(
      "crossword-clash-tts",
      JSON.stringify({ ...DEFAULT_TTS_SETTINGS, engine: "unknown" }),
    );
    expect(loadTTSSettings().engine).toBe("browser");
  });

  it("defaults elevenLabsVoiceId to null when not set", () => {
    expect(loadTTSSettings().elevenLabsVoiceId).toBeNull();
  });

  it("round-trips elevenLabsVoiceId", () => {
    const settings: TTSSettings = {
      ...DEFAULT_TTS_SETTINGS,
      elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM",
    };
    saveTTSSettings(settings);
    expect(loadTTSSettings().elevenLabsVoiceId).toBe("21m00Tcm4TlvDq8ikWAM");
  });

  it("uses null for non-string elevenLabsVoiceId", () => {
    localStorage.setItem(
      "crossword-clash-tts",
      JSON.stringify({ ...DEFAULT_TTS_SETTINGS, elevenLabsVoiceId: 123 }),
    );
    expect(loadTTSSettings().elevenLabsVoiceId).toBeNull();
  });

  it("defaults narratorEngine to null when not set", () => {
    expect(loadTTSSettings().narratorEngine).toBeNull();
  });

  it("round-trips narratorEngine elevenlabs-agent", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS, narratorEngine: "elevenlabs-agent" });
    expect(loadTTSSettings().narratorEngine).toBe("elevenlabs-agent");
  });

  it("round-trips narratorEngine openai-agent", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS, narratorEngine: "openai-agent" });
    expect(loadTTSSettings().narratorEngine).toBe("openai-agent");
  });

  it("round-trips narratorEngine claude", () => {
    saveTTSSettings({ ...DEFAULT_TTS_SETTINGS, narratorEngine: "claude" });
    expect(loadTTSSettings().narratorEngine).toBe("claude");
  });

  it("defaults narratorEngine for unknown value", () => {
    localStorage.setItem(
      "crossword-clash-tts",
      JSON.stringify({ ...DEFAULT_TTS_SETTINGS, narratorEngine: "unknown" }),
    );
    expect(loadTTSSettings().narratorEngine).toBeNull();
  });
});
