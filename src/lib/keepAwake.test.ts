// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { keepScreenAwake, useKeepAwake } from "./keepAwake";

function fakeWakeLock() {
  const sentinels: { released: boolean; release: ReturnType<typeof vi.fn> }[] = [];
  const request = vi.fn(async () => {
    const s = { released: false, release: vi.fn(async () => { s.released = true; }) };
    sentinels.push(s);
    return s;
  });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, sentinels };
}

let visibility: DocumentVisibilityState = "visible";
beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", { get: () => visibility, configurable: true });
});
afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("keepScreenAwake on the web", () => {
  it("asks for a screen wake lock and releases it", async () => {
    const { request, sentinels } = fakeWakeLock();
    const release = keepScreenAwake();
    await flush();
    expect(request).toHaveBeenCalledWith("screen");
    release();
    expect(sentinels[0].release).toHaveBeenCalled();
  });

  it("asks again when the page comes back, since the browser drops the lock when hidden", async () => {
    const { request, sentinels } = fakeWakeLock();
    const release = keepScreenAwake();
    await flush();
    sentinels[0].released = true; // what the browser does on hide
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(request).toHaveBeenCalledTimes(1);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    release();
  });

  it("sends one request at a time, so a hide and show while it is pending leaks no lock", async () => {
    const { request, sentinels } = fakeWakeLock();
    const release = keepScreenAwake();
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    release();
    expect(sentinels.every((s) => s.release.mock.calls.length === 1)).toBe(true);
  });

  it("does nothing where the API is missing or refuses", async () => {
    expect(() => keepScreenAwake()()).not.toThrow();
    Object.defineProperty(navigator, "wakeLock", { value: { request: vi.fn(async () => { throw new Error("NotAllowed"); }) }, configurable: true });
    const release = keepScreenAwake();
    await flush();
    expect(() => release()).not.toThrow();
  });

  it("releases a lock that was granted after the screen had already let go", async () => {
    const { sentinels } = fakeWakeLock();
    const release = keepScreenAwake();
    release();
    await flush();
    expect(sentinels[0].release).toHaveBeenCalled();
  });
});

describe("useKeepAwake", () => {
  it("holds the lock while mounted and active", async () => {
    const { request, sentinels } = fakeWakeLock();
    const { rerender, unmount } = renderHook(({ active }) => useKeepAwake(active), { initialProps: { active: false } });
    await flush();
    expect(request).not.toHaveBeenCalled();
    rerender({ active: true });
    await flush();
    expect(request).toHaveBeenCalledOnce();
    unmount();
    expect(sentinels[0].release).toHaveBeenCalled();
  });
});
