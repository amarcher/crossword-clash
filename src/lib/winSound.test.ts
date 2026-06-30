import { describe, it, expect } from "vitest";
import { shouldPlayWinSound, playWinSound } from "./winSound";

describe("shouldPlayWinSound", () => {
  it("plays when not muted", () => {
    expect(shouldPlayWinSound(false)).toBe(true);
  });

  it("is silent when muted", () => {
    expect(shouldPlayWinSound(true)).toBe(false);
  });
});

describe("playWinSound", () => {
  it("is a safe no-op without AudioContext (node/jsdom)", () => {
    // No AudioContext in the test environment: must not throw.
    expect(() => playWinSound()).not.toThrow();
    expect(() => playWinSound({ muted: false })).not.toThrow();
  });

  it("returns early when explicitly muted", () => {
    expect(() => playWinSound({ muted: true })).not.toThrow();
  });
});
