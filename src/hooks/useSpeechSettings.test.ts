// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSpeechSettings } from "./useSpeechSettings";
import { saveTTSSettings } from "../lib/ttsSettings";
import type { TTSSettings } from "../lib/ttsSettings";

const mockSpeak = vi.fn();
const mockGetVoices = vi.fn<() => SpeechSynthesisVoice[]>(() => []);
const listeners: Record<string, (() => void)[]> = {};

class MockUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

beforeEach(() => {
  localStorage.clear();
  mockSpeak.mockClear();
  mockGetVoices.mockReturnValue([]);
  for (const key of Object.keys(listeners)) delete listeners[key];

  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    value: MockUtterance,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis, "speechSynthesis", {
    value: {
      speak: mockSpeak,
      getVoices: mockGetVoices,
      addEventListener: (event: string, cb: () => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      },
      removeEventListener: (event: string, cb: () => void) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((fn) => fn !== cb);
        }
      },
    },
    writable: true,
    configurable: true,
  });
});

describe("useSpeechSettings", () => {
  it("initializes with default settings", () => {
    const { result } = renderHook(() => useSpeechSettings());
    expect(result.current.muted).toBe(false);
    expect(result.current.voiceName).toBeNull();
    expect(result.current.rate).toBe(1.0);
    expect(result.current.pitch).toBe(1.0);
  });

  it("loads persisted settings", () => {
    const saved: TTSSettings = { muted: true, voiceName: "TestVoice", rate: 1.5, pitch: 0.8 };
    saveTTSSettings(saved);
    const { result } = renderHook(() => useSpeechSettings());
    expect(result.current.muted).toBe(true);
    expect(result.current.voiceName).toBe("TestVoice");
    expect(result.current.rate).toBe(1.5);
    expect(result.current.pitch).toBe(0.8);
  });

  it("toggleMute flips muted state", () => {
    const { result } = renderHook(() => useSpeechSettings());
    expect(result.current.muted).toBe(false);
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(true);
    act(() => result.current.toggleMute());
    expect(result.current.muted).toBe(false);
  });

  it("persists settings changes to localStorage", () => {
    const { result } = renderHook(() => useSpeechSettings());
    act(() => result.current.setRate(1.8));
    const stored = JSON.parse(localStorage.getItem("crossword-clash-tts")!);
    expect(stored.rate).toBe(1.8);
  });

  it("speak calls speechSynthesis.speak with correct settings", () => {
    const mockVoice = { name: "TestVoice" } as SpeechSynthesisVoice;
    mockGetVoices.mockReturnValue([mockVoice]);

    saveTTSSettings({ muted: false, voiceName: "TestVoice", rate: 1.5, pitch: 0.8 });
    const { result } = renderHook(() => useSpeechSettings());

    act(() => result.current.speak("Hello"));

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.text).toBe("Hello");
    expect(utterance.rate).toBe(1.5);
    expect(utterance.pitch).toBe(0.8);
    expect(utterance.voice).toBe(mockVoice);
  });

  it("speak does nothing when muted", () => {
    saveTTSSettings({ muted: true, voiceName: null, rate: 1.0, pitch: 1.0 });
    const { result } = renderHook(() => useSpeechSettings());

    act(() => result.current.speak("Hello"));

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("speak uses default voice when voiceName is null", () => {
    const { result } = renderHook(() => useSpeechSettings());

    act(() => result.current.speak("Hello"));

    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.voice).toBeNull();
  });

  it("updates voices when voiceschanged fires", () => {
    const { result } = renderHook(() => useSpeechSettings());
    expect(result.current.voices).toEqual([]);

    const mockVoice = { name: "NewVoice", lang: "en-US" } as SpeechSynthesisVoice;
    mockGetVoices.mockReturnValue([mockVoice]);

    act(() => {
      for (const cb of listeners["voiceschanged"] ?? []) cb();
    });

    expect(result.current.voices).toEqual([mockVoice]);
  });

  it("openSettings and closeSettings toggle modal state", () => {
    const { result } = renderHook(() => useSpeechSettings());
    expect(result.current.settingsOpen).toBe(false);
    act(() => result.current.openSettings());
    expect(result.current.settingsOpen).toBe(true);
    act(() => result.current.closeSettings());
    expect(result.current.settingsOpen).toBe(false);
  });

  it("setVoiceName updates voice and persists", () => {
    const { result } = renderHook(() => useSpeechSettings());
    act(() => result.current.setVoiceName("Google UK English Male"));
    expect(result.current.voiceName).toBe("Google UK English Male");
    const stored = JSON.parse(localStorage.getItem("crossword-clash-tts")!);
    expect(stored.voiceName).toBe("Google UK English Male");
  });

  it("setPitch updates pitch and persists", () => {
    const { result } = renderHook(() => useSpeechSettings());
    act(() => result.current.setPitch(1.3));
    expect(result.current.pitch).toBe(1.3);
    const stored = JSON.parse(localStorage.getItem("crossword-clash-tts")!);
    expect(stored.pitch).toBe(1.3);
  });
});
