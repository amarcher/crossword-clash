import { describe, it, expect, vi } from "vitest";
import { createRoutePrefetcher } from "./routeModules";

function loaders() {
  return {
    "/classics": vi.fn(() => Promise.resolve({})),
    "/daily/leaderboard": vi.fn(() => Promise.resolve({})),
    "/daily": vi.fn(() => Promise.resolve({})),
    "/broken": vi.fn(() => Promise.reject(new Error("offline"))),
  };
}

describe("createRoutePrefetcher", () => {
  it("loads a route's module once, however many times it is warmed", async () => {
    const l = loaders();
    const p = createRoutePrefetcher(l);
    const a = p.prefetch("/classics");
    const b = p.prefetch("/classics");
    expect(a).toBe(b);
    await a;
    expect(l["/classics"]).toHaveBeenCalledTimes(1);
    expect(p.isLoaded("/classics")).toBe(true);
  });

  it("matches the longest prefix on a path boundary and ignores query/hash", async () => {
    const l = loaders();
    const p = createRoutePrefetcher(l);
    await p.prefetch("/daily/leaderboard/large?x=1#y");
    expect(l["/daily/leaderboard"]).toHaveBeenCalledTimes(1);
    expect(l["/daily"]).not.toHaveBeenCalled();
    expect(p.isLoaded("/daily/leaderboard")).toBe(true);
    expect(p.isLoaded("/daily")).toBe(false);
    // "/classicsfoo" is not under "/classics".
    expect(p.prefetch("/classicsfoo")).toBeNull();
  });

  it("returns null for statically bundled paths, which count as loaded", () => {
    const p = createRoutePrefetcher(loaders());
    expect(p.prefetch("/menu")).toBeNull();
    expect(p.prefetch("/")).toBeNull();
    expect(p.isLoaded("/menu")).toBe(true);
  });

  it("forgets a failed load so the next intent retries it", async () => {
    const l = loaders();
    const p = createRoutePrefetcher(l);
    await p.prefetch("/broken");
    expect(p.isLoaded("/broken")).toBe(false);
    await p.prefetch("/broken");
    expect(l["/broken"]).toHaveBeenCalledTimes(2);
  });
});
