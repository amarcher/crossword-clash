import { describe, it, expect, vi } from "vitest";
import { watchSoloLifecycle } from "./soloLifecycle";

const listeners = vi.hoisted(() => new Map<string, (event?: { isActive: boolean }) => void>());
const remove = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/app", () => ({ App: new Proxy({}, { get: (_, key) => {
  if (key === "then") throw new Error("Plugin must not be awaited");
  if (key === "addListener") return vi.fn(async (name: string, listener: (event?: { isActive: boolean }) => void) => {
    listeners.set(name, listener); return { remove };
  });
} }) }));

describe.skipIf(import.meta.env.MODE !== "mobile")("solo native lifecycle", () => {
  it("pauses on background, handles Back, and releases both listeners", async () => {
    const hide = vi.fn();
    const back = vi.fn();
    const dispose = watchSoloLifecycle(hide, back);
    await vi.waitFor(() => expect(listeners.size).toBe(2));
    listeners.get("appStateChange")?.({ isActive: true });
    expect(hide).not.toHaveBeenCalled();
    listeners.get("appStateChange")?.({ isActive: false });
    listeners.get("backButton")?.();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
    dispose();
    expect(remove).toHaveBeenCalledTimes(2);
    listeners.get("backButton")?.();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
