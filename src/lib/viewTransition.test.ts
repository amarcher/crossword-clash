// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { canViewTransition, withViewTransition } from "./viewTransition";

// lib.dom types the API as always present; the tests install and remove it.
const doc = document as unknown as { startViewTransition?: (update: () => void | Promise<void>) => unknown };
const proc = (globalThis as unknown as { process: unknown }).process as { on(e: string, f: () => void): void; off(e: string, f: () => void): void };

function stubMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  delete doc.startViewTransition;
});

describe("canViewTransition", () => {
  it("is false without the API, under reduced motion, and true otherwise", () => {
    stubMatchMedia(false);
    expect(canViewTransition()).toBe(false);
    doc.startViewTransition = () => ({});
    expect(canViewTransition()).toBe(true);
    stubMatchMedia(true);
    expect(canViewTransition()).toBe(false);
  });
});

describe("withViewTransition", () => {
  it("runs the update plainly when the API is unavailable", async () => {
    stubMatchMedia(false);
    const update = vi.fn();
    await withViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("hands the update to the API and swallows every rejectable promise", async () => {
    stubMatchMedia(false);
    const update = vi.fn(async () => {});
    const rejected = () => Promise.reject(new Error("skipped"));
    const start = vi.fn(() => ({
      ready: rejected(),
      updateCallbackDone: rejected(),
      finished: rejected(),
    }));
    doc.startViewTransition = start;
    const unhandled = vi.fn();
    proc.on("unhandledRejection", unhandled);
    await withViewTransition(update);
    await new Promise((r) => setTimeout(r, 0));
    proc.off("unhandledRejection", unhandled);
    expect(start).toHaveBeenCalledWith(update);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
