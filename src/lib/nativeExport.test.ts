import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The filesystem and share plugins are Capacitor plugin Proxies that answer
 * every property, `then` included (see nativePluginProxy.test.ts for the
 * freeze that rule comes from). These load nativeExport.ts through stubs with
 * that property and prove every path settles without ever calling `then`.
 */
function pluginLike(impl: Record<string, (...args: unknown[]) => unknown>, calls: string[]) {
  return new Proxy({}, {
    get(_, prop) {
      if (prop === "$$typeof") return undefined;
      if (prop === "toJSON") return () => ({});
      return (...args: unknown[]) => {
        calls.push(String(prop));
        const fn = impl[String(prop)];
        return fn ? fn(...args) : new Promise(() => {}); // an unknown method, `then` included, never answers
      };
    },
  });
}

const calls: string[] = [];
const fsImpl: Record<string, (...args: unknown[]) => unknown> = {};
const shareImpl: Record<string, (...args: unknown[]) => unknown> = {};

vi.mock("@capacitor/core", () => ({ Capacitor: { getPlatform: () => "ios", isNativePlatform: () => true } }));
vi.mock("@capacitor/filesystem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@capacitor/filesystem")>()),
  Filesystem: pluginLike(fsImpl, calls),
}));
vi.mock("@capacitor/share", () => ({ Share: pluginLike(shareImpl, calls) }));

const settles = <T,>(p: Promise<T>) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("never settled")), 1000))]);

beforeEach(() => {
  vi.stubEnv("MODE", "mobile");
  calls.length = 0;
  Object.keys(fsImpl).forEach((k) => delete fsImpl[k]);
  Object.keys(shareImpl).forEach((k) => delete shareImpl[k]);
});
afterEach(() => vi.unstubAllEnvs());

describe("nativeExport", () => {
  it("is only for the native app in a mobile build", async () => {
    const mod = await import("./nativeExport");
    expect(mod.nativeExportAvailable({ isNativePlatform: () => true })).toBe(true);
    expect(mod.nativeExportAvailable({ isNativePlatform: () => false })).toBe(false);
    vi.stubEnv("MODE", "production");
    expect(mod.nativeExportAvailable({ isNativePlatform: () => true })).toBe(false);
  });

  it("encodes bytes as base64 in chunks", async () => {
    const { toBase64 } = await import("./nativeExport");
    expect(toBase64(new TextEncoder().encode("ACROSS"))).toBe(btoa("ACROSS"));
    const big = new Uint8Array(70000).map((_, i) => i % 251);
    expect(atob(toBase64(big)).length).toBe(70000);
  });

  it("writes the file to the cache directory and shares its uri, without ever awaiting a plugin proxy", async () => {
    const mod = await import("./nativeExport");
    mod.resetNativeExportForTests();
    const { Directory } = await vi.importActual<typeof import("@capacitor/filesystem")>("@capacitor/filesystem");
    let written: { path: string; data: string; directory: string; recursive?: boolean } | undefined;
    let shared: { title?: string; url?: string } | undefined;
    fsImpl.writeFile = async (opts: unknown) => {
      written = opts as typeof written;
      return { uri: "file:///caches/studio-exports/my-puzzle.ipuz" };
    };
    shareImpl.share = async (opts: unknown) => {
      shared = opts as typeof shared;
      return { activityType: "com.apple.UIKit.activity.AirDrop" };
    };
    const bytes = new TextEncoder().encode('{"version":"http://ipuz.org/v2"}');
    await expect(settles(mod.exportNatively({ name: "my-puzzle.ipuz", bytes, title: "My puzzle" }))).resolves.toBe("shared");
    expect(written).toMatchObject({ path: `${mod.EXPORT_FOLDER}/my-puzzle.ipuz`, recursive: true });
    // The spelled-out directory matches the plugin's enum (no runtime import of the enum, so the web bundle stays free of it).
    expect(written?.directory).toBe(Directory.Cache);
    expect(atob(written!.data)).toBe('{"version":"http://ipuz.org/v2"}');
    expect(shared).toMatchObject({ title: "My puzzle", url: "file:///caches/studio-exports/my-puzzle.ipuz" });
    expect(calls).toEqual(["writeFile", "share"]);
    expect(calls).not.toContain("then");
  });

  it("reports a dismissed share sheet as cancelled and rethrows anything else", async () => {
    const mod = await import("./nativeExport");
    mod.resetNativeExportForTests();
    fsImpl.writeFile = async () => ({ uri: "file:///x.puz" });
    shareImpl.share = async () => {
      throw new Error("Share canceled");
    };
    await expect(settles(mod.exportNatively({ name: "x.puz", bytes: new Uint8Array([1, 2, 3]) }))).resolves.toBe("cancelled");
    shareImpl.share = async () => {
      throw new Error("No activity found");
    };
    await expect(settles(mod.exportNatively({ name: "x.puz", bytes: new Uint8Array([1]) }))).rejects.toThrow(/No activity/);
    expect(calls).not.toContain("then");
  });

  it("refuses outside a mobile build", async () => {
    vi.stubEnv("MODE", "production");
    const mod = await import("./nativeExport");
    mod.resetNativeExportForTests();
    await expect(settles(mod.exportNatively({ name: "x.puz", bytes: new Uint8Array([1]) }))).rejects.toThrow(/only available in the apps/);
    expect(calls).toEqual([]);
  });
});
