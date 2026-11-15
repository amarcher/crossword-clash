import { beforeEach, describe, expect, it, vi } from "vitest";

/** The clock and battery were dark on the dark TV stage (Andrew, 2026-11-14). */
const native = vi.hoisted(() => ({ on: true }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.on } }));
const setStyle = vi.hoisted(() => vi.fn(async () => {}));
// The real plugin object is a Proxy that answers `then`; the module must never be resolved to it.
vi.mock("@capacitor/status-bar", () => ({
  Style: { Dark: "DARK", Light: "LIGHT" },
  StatusBar: new Proxy({ setStyle }, { get: (t, k) => (k === "then" ? () => {} : (t as Record<string | symbol, unknown>)[k]) }),
}));

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MODE", "mobile");
  setStyle.mockClear();
  native.on = true;
});

describe("lightStatusBar", () => {
  it("turns the text light for the first holder and dark again only when the last lets go", async () => {
    const { lightStatusBar } = await import("./statusBar");
    const lobby = lightStatusBar();
    const game = lightStatusBar();
    await settle();
    expect(setStyle.mock.calls).toEqual([[{ style: "DARK" }]]);
    lobby();
    lobby();
    await settle();
    expect(setStyle).toHaveBeenCalledTimes(1);
    game();
    await settle();
    expect(setStyle).toHaveBeenLastCalledWith({ style: "LIGHT" });
  });

  it("does nothing on the web", async () => {
    native.on = false;
    const { lightStatusBar } = await import("./statusBar");
    lightStatusBar()();
    await settle();
    expect(setStyle).not.toHaveBeenCalled();
  });
});
