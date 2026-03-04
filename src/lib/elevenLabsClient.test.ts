// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadElevenLabsGate,
  isElevenLabsAvailable,
  ELEVENLABS_VOICES,
} from "./elevenLabsClient";

beforeEach(() => {
  localStorage.clear();
});

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

describe("loadElevenLabsGate", () => {
  it("returns null when no key is set", () => {
    expect(loadElevenLabsGate()).toBeNull();
  });

  it("returns gate when valid", () => {
    localStorage.setItem(
      "crossword-clash-elevenlabs",
      JSON.stringify({ enabled: true, token: "my-secret" }),
    );
    expect(loadElevenLabsGate()).toEqual({ enabled: true, token: "my-secret" });
  });

  it("returns null when enabled is false", () => {
    localStorage.setItem(
      "crossword-clash-elevenlabs",
      JSON.stringify({ enabled: false, token: "my-secret" }),
    );
    expect(loadElevenLabsGate()).toBeNull();
  });

  it("returns null when token is empty", () => {
    localStorage.setItem(
      "crossword-clash-elevenlabs",
      JSON.stringify({ enabled: true, token: "" }),
    );
    expect(loadElevenLabsGate()).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("crossword-clash-elevenlabs", "not json{");
    expect(loadElevenLabsGate()).toBeNull();
  });

  it("returns null when enabled is not boolean", () => {
    localStorage.setItem(
      "crossword-clash-elevenlabs",
      JSON.stringify({ enabled: "yes", token: "abc" }),
    );
    expect(loadElevenLabsGate()).toBeNull();
  });

  it("returns null when token is not a string", () => {
    localStorage.setItem(
      "crossword-clash-elevenlabs",
      JSON.stringify({ enabled: true, token: 123 }),
    );
    expect(loadElevenLabsGate()).toBeNull();
  });
});

describe("isElevenLabsAvailable", () => {
  it("returns false when no gate", () => {
    expect(isElevenLabsAvailable()).toBe(false);
  });

  it("returns true when valid gate is set", () => {
    localStorage.setItem(
      "crossword-clash-elevenlabs",
      JSON.stringify({ enabled: true, token: "my-secret" }),
    );
    expect(isElevenLabsAvailable()).toBe(true);
  });
});
