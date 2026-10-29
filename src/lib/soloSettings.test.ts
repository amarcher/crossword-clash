// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SOLO_SETTINGS,
  SOLO_SETTINGS_KEY,
  loadSoloSettings,
  resetSoloSettingsForTests,
  sanitizeSoloSettings,
  saveSoloSettings,
  subscribeSoloSettings,
  updateSoloSettings,
  useSoloSettings,
} from "./soloSettings";

beforeEach(() => {
  localStorage.clear();
  resetSoloSettingsForTests();
});
afterEach(() => {
  resetSoloSettingsForTests();
});

describe("sanitizeSoloSettings", () => {
  it("defaults autocheck to on and keeps only a boolean", () => {
    expect(sanitizeSoloSettings(null)).toEqual({ autocheck: true });
    expect(sanitizeSoloSettings({})).toEqual({ autocheck: true });
    expect(sanitizeSoloSettings({ autocheck: "no" })).toEqual({ autocheck: true });
    expect(sanitizeSoloSettings({ autocheck: false, other: 1 })).toEqual({ autocheck: false });
    expect(DEFAULT_SOLO_SETTINGS.autocheck).toBe(true);
  });
});

describe("solo settings storage", () => {
  it("round-trips through localStorage under its key and survives junk", () => {
    expect(loadSoloSettings()).toEqual({ autocheck: true });
    saveSoloSettings({ autocheck: false });
    expect(JSON.parse(localStorage.getItem(SOLO_SETTINGS_KEY)!)).toEqual({ autocheck: false });
    resetSoloSettingsForTests();
    expect(loadSoloSettings()).toEqual({ autocheck: false });

    localStorage.setItem(SOLO_SETTINGS_KEY, "{not json");
    resetSoloSettingsForTests();
    expect(loadSoloSettings()).toEqual({ autocheck: true });
  });

  it("notifies subscribers on every save and hands back a stable snapshot between them", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSoloSettings(listener);
    const first = loadSoloSettings();
    expect(loadSoloSettings()).toBe(first);
    expect(updateSoloSettings({ autocheck: false })).toEqual({ autocheck: false });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(loadSoloSettings()).not.toBe(first);
    unsubscribe();
    updateSoloSettings({ autocheck: true });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("useSoloSettings", () => {
  it("reads the device's setting, and setAutocheck persists and re-renders", () => {
    const { result } = renderHook(() => useSoloSettings());
    expect(result.current.autocheck).toBe(true);
    act(() => result.current.setAutocheck(false));
    expect(result.current.autocheck).toBe(false);
    expect(JSON.parse(localStorage.getItem(SOLO_SETTINGS_KEY)!)).toEqual({ autocheck: false });
    // A second hook sees the same store.
    const other = renderHook(() => useSoloSettings());
    expect(other.result.current.autocheck).toBe(false);
  });
});
