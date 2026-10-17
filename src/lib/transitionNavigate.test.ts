import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { navigateWithTransition, TRANSITION_WAIT_MS } from "./transitionNavigate";
import { prefetchRoute } from "../routeModules";
import { nextRouteCommit } from "./routeCommit";
import { canViewTransition, withViewTransition } from "./viewTransition";

vi.mock("../routeModules", () => ({ prefetchRoute: vi.fn() }));
vi.mock("./routeCommit", () => ({ nextRouteCommit: vi.fn(async () => {}) }));
vi.mock("./viewTransition", () => ({
  canViewTransition: vi.fn(() => true),
  withViewTransition: vi.fn(async (update: () => Promise<void>) => {
    await update();
  }),
}));

const mockPrefetch = vi.mocked(prefetchRoute);
const mockCan = vi.mocked(canViewTransition);
const mockWith = vi.mocked(withViewTransition);
const mockCommit = vi.mocked(nextRouteCommit);

beforeEach(() => {
  vi.useFakeTimers();
  mockCan.mockReturnValue(true);
  mockPrefetch.mockReturnValue(null);
  mockCommit.mockImplementation(async () => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("navigateWithTransition", () => {
  it("navigates with flushSync inside a view transition when the route is already bundled", async () => {
    const navigate = vi.fn(async () => {});
    await navigateWithTransition(navigate, "/menu");
    expect(mockWith).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/menu", { flushSync: true });
  });

  it("waits for the route commit signal after navigate resolves", async () => {
    const order: string[] = [];
    mockCommit.mockImplementation(() => {
      order.push("wait-armed");
      return new Promise<void>((r) => setTimeout(() => { order.push("committed"); r(); }, 5));
    });
    const navigate = vi.fn(async () => { order.push("navigated"); });
    let settled = false;
    const done = navigateWithTransition(navigate, "/menu").then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(4);
    expect(order).toEqual(["wait-armed", "navigated"]);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(order).toEqual(["wait-armed", "navigated", "committed"]);
  });

  it("keeps replace and other options alongside flushSync", async () => {
    const navigate = vi.fn(async () => {});
    await navigateWithTransition(navigate, "/menu", { replace: true });
    expect(navigate).toHaveBeenCalledWith("/menu", { replace: true, flushSync: true });
  });

  it("navigates plainly without the API or under reduced motion, still warming the chunk", async () => {
    mockCan.mockReturnValue(false);
    const navigate = vi.fn(async () => {});
    await navigateWithTransition(navigate, "/classics");
    expect(mockPrefetch).toHaveBeenCalledWith("/classics");
    expect(mockWith).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/classics", {});
  });

  it("fades when the chunk arrives within the budget", async () => {
    let resolveChunk!: () => void;
    mockPrefetch.mockReturnValue(new Promise<void>((r) => (resolveChunk = r)));
    const navigate = vi.fn(async () => {});
    const done = navigateWithTransition(navigate, "/classics");
    await vi.advanceTimersByTimeAsync(TRANSITION_WAIT_MS / 2);
    expect(navigate).not.toHaveBeenCalled();
    resolveChunk();
    await done;
    expect(mockWith).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/classics", { flushSync: true });
  });

  it("gives up on the fade and navigates plainly when the chunk is slow", async () => {
    mockPrefetch.mockReturnValue(new Promise<void>(() => {}));
    const navigate = vi.fn(async () => {});
    const done = navigateWithTransition(navigate, "/classics");
    await vi.advanceTimersByTimeAsync(TRANSITION_WAIT_MS);
    await done;
    expect(mockWith).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/classics", {});
  });

  it("navigates plainly when the chunk fails to load, so the router reports the error", async () => {
    mockPrefetch.mockReturnValue(Promise.reject(new Error("offline")));
    const navigate = vi.fn(async () => {});
    await navigateWithTransition(navigate, "/classics");
    expect(mockWith).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/classics", {});
  });
});
