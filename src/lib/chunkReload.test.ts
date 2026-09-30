// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHUNK_RELOAD_KEY, isChunkLoadError, reloadOnceForChunkError } from "./chunkReload";

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://x/assets/a-123.js",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    "Loading chunk 5 failed.",
  ])("detects %s", (msg) => {
    // "Loading chunk" alone is not a listed pattern; ChunkLoadError is by name.
    const err = msg.startsWith("Loading chunk")
      ? Object.assign(new Error(msg), { name: "ChunkLoadError" })
      : new TypeError(msg);
    expect(isChunkLoadError(err)).toBe(true);
  });

  it("rejects unrelated errors and non-errors", () => {
    expect(isChunkLoadError(new Error("nope"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({ status: 404 })).toBe(false);
  });

  it("accepts string and message-bearing objects", () => {
    expect(isChunkLoadError("Importing a module script failed")).toBe(true);
    expect(isChunkLoadError({ message: "Failed to fetch dynamically imported module" })).toBe(true);
  });
});

describe("reloadOnceForChunkError", () => {
  const reload = vi.fn();
  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  it("reloads the first time and stamps sessionStorage", () => {
    expect(reloadOnceForChunkError(1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe("1000000");
  });

  it("does not loop: a second failure inside the window does not reload", () => {
    reloadOnceForChunkError(1_000_000);
    expect(reloadOnceForChunkError(1_005_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("may reload again once the window has passed", () => {
    reloadOnceForChunkError(1_000_000);
    expect(reloadOnceForChunkError(1_011_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload when sessionStorage is unavailable (no loop guard possible)", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(reloadOnceForChunkError()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
