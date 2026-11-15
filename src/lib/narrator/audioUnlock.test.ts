// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { narratorAudioContext, resetNarratorAudioForTests, unlockNarratorAudio } from "./audioUnlock";

/** The host said nothing on an iPad: its audio was created with no tap behind it (Andrew, 2026-11-14). */
class FakeContext {
  static made = 0;
  state = "suspended";
  destination = {};
  resume = vi.fn(async () => {
    this.state = "running";
  });
  start = vi.fn();
  createBuffer = vi.fn(() => ({}));
  createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), start: this.start }));
  constructor() {
    FakeContext.made += 1;
  }
}

beforeEach(() => {
  FakeContext.made = 0;
  resetNarratorAudioForTests();
  vi.stubGlobal("AudioContext", FakeContext);
  window.AudioContext = FakeContext as unknown as typeof AudioContext;
});
afterEach(() => vi.unstubAllGlobals());

describe("unlockNarratorAudio", () => {
  it("resumes one shared context and plays a silent sample inside the tap", () => {
    unlockNarratorAudio();
    const ctx = narratorAudioContext() as unknown as FakeContext;
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.start).toHaveBeenCalledWith(0);
    unlockNarratorAudio();
    expect(FakeContext.made).toBe(1);
    expect(narratorAudioContext()).toBe(ctx);
  });

  it("makes a new context once the old one is closed, and is quiet where Web Audio is missing", () => {
    const first = narratorAudioContext() as unknown as FakeContext;
    first.state = "closed";
    expect(narratorAudioContext()).not.toBe(first);
    resetNarratorAudioForTests();
    // @ts-expect-error a browser without Web Audio
    delete window.AudioContext;
    expect(narratorAudioContext()).toBeNull();
    expect(() => unlockNarratorAudio()).not.toThrow();
  });
});
