// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importNativeNytPuzzle, loadNativeNytImport, NATIVE_NYT_INBOX, validateNativeNytPuzzle } from "./nativeNytImport";
import { samplePuzzle } from "./samplePuzzle";
import type { Puzzle } from "../types/puzzle";

const mock = vi.hoisted(() => ({ open: vi.fn(), native: true }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => mock.native, isPluginAvailable: () => mock.native },
  registerPlugin: () => ({ open: mock.open }),
}));
const imported: Puzzle = { ...samplePuzzle, source: { provider: "nyt", kind: "daily", date: "2026-09-10",
  url: "https://www.nytimes.com/crosswords/game/daily/2026/09/10" } };

beforeEach(() => { localStorage.clear(); mock.open.mockReset(); mock.native = true; });

describe("native import handoff", () => {
  it("persists a validated result and restores it after reopening", async () => {
    mock.open.mockResolvedValue({ cancelled: false, result: JSON.stringify({ status: "ok", puzzle: imported }) });
    const result = await importNativeNytPuzzle(imported.source!.url, { import: "Import" });
    expect(result?.title).toBe(imported.title);
    expect(loadNativeNytImport()).toEqual(result);
    expect(mock.open).toHaveBeenCalledExactlyOnceWith({ url: imported.source!.url, labels: { import: "Import" } });
  });
  it("cancellation preserves the previous imported puzzle", async () => {
    localStorage.setItem(NATIVE_NYT_INBOX, JSON.stringify(imported));
    mock.open.mockResolvedValue({ cancelled: true });
    expect(await importNativeNytPuzzle(imported.source!.url, {})).toBeNull();
    expect(loadNativeNytImport()?.title).toBe(imported.title);
  });
  it("does not replace the saved puzzle with a malformed native result", async () => {
    localStorage.setItem(NATIVE_NYT_INBOX, JSON.stringify(imported));
    mock.open.mockResolvedValue({ cancelled: false, result: JSON.stringify({ status: "ok", puzzle: { cells: [] } }) });
    await expect(importNativeNytPuzzle(imported.source!.url, {})).rejects.toThrow();
    expect(loadNativeNytImport()?.title).toBe(imported.title);
  });
  it("rejects results with a forged source or inconsistent answers", () => {
    expect(() => validateNativeNytPuzzle({ ...imported, source: { ...imported.source, url: "https://evil.test" } })).toThrow();
    expect(() => validateNativeNytPuzzle({ ...imported, clues: [{ ...imported.clues[0], answer: "FAKE" }] })).toThrow();
  });
  it("drops unexpected account fields from persistence", () => {
    const result = validateNativeNytPuzzle({ ...imported, cookie: "never-save", account: { id: "never-save" } });
    expect(JSON.stringify(result)).not.toContain("never-save");
  });
  it("handles corrupt local storage without interrupting the menu", () => {
    localStorage.setItem(NATIVE_NYT_INBOX, "broken-json");
    expect(loadNativeNytImport()).toBeNull();
  });
  it("does not pretend a regular web browser can use the native importer", async () => {
    mock.native = false;
    await expect(importNativeNytPuzzle(imported.source!.url, {})).rejects.toThrow("UNAVAILABLE");
    expect(mock.open).not.toHaveBeenCalled();
  });
});
