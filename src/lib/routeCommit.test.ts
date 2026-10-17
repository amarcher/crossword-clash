import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nextRouteCommit, signalRouteCommit, ROUTE_COMMIT_TIMEOUT_MS } from "./routeCommit";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("routeCommit", () => {
  it("resolves every waiter on the next commit signal", async () => {
    const a = vi.fn();
    const b = vi.fn();
    void nextRouteCommit().then(a);
    void nextRouteCommit().then(b);
    await vi.advanceTimersByTimeAsync(0);
    expect(a).not.toHaveBeenCalled();
    signalRouteCommit();
    await vi.advanceTimersByTimeAsync(0);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // A later signal does not re-resolve or leak the old waiters.
    signalRouteCommit();
    await vi.advanceTimersByTimeAsync(0);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout so a transition can never hang", async () => {
    const done = vi.fn();
    void nextRouteCommit().then(done);
    await vi.advanceTimersByTimeAsync(ROUTE_COMMIT_TIMEOUT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
    // The timed-out waiter is gone; a signal now resolves nothing twice.
    signalRouteCommit();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
