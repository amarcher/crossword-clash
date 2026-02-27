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
});
