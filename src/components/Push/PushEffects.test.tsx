// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";

/**
 * The first-open permission ask (Andrew, 2026-11-03): one OS prompt per
 * device, a beat after the session user exists, only while the OS still says
 * "prompt"; a grant registers the token. A device that already answered is
 * never asked, and the ask is remembered so the next launch is quiet.
 */
const push = vi.hoisted(() => ({
  available: true,
  permission: "prompt" as "prompt" | "granted" | "denied",
  enablePush: vi.fn(async () => "granted" as "granted" | "denied" | "prompt"),
  registerPushToken: vi.fn(async () => "tok"),
}));
vi.mock("../../lib/push", () => ({
  PUSH_TOKEN_KEY: "crossword-clash:push-token",
  pushAvailable: () => push.available,
  checkPushPermission: async () => push.permission,
  enablePush: push.enablePush,
  registerPushToken: push.registerPushToken,
  startPushTaps: () => () => {},
}));
const account = vi.hoisted(() => ({ sessionUserId: "u1" as string | null }));
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => ({ sessionUserId: account.sessionUserId }) }));
const track = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ track }));

const { PushEffects, PUSH_FIRST_ASK_KEY, FIRST_ASK_DELAY_MS } = await import("./PushEffects");

function renderEffects() {
  return render(
    <MemoryRouter>
      <PushEffects />
    </MemoryRouter>,
  );
}
const elapse = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  push.available = true;
  push.permission = "prompt";
  push.enablePush.mockClear().mockResolvedValue("granted");
  push.registerPushToken.mockClear();
  account.sessionUserId = "u1";
  track.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PushEffects first-open ask", () => {
  it("asks once, a beat after the session user exists, registers on a grant and remembers the ask", async () => {
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS - 1);
    expect(push.enablePush).not.toHaveBeenCalled();
    await elapse(1);
    expect(push.enablePush).toHaveBeenCalledTimes(1);
    expect(push.enablePush).toHaveBeenCalledWith("u1", { locale: "en" });
    expect(track).toHaveBeenCalledWith("push_permission_prompted", { placement: "first_open" });
    expect(track).toHaveBeenCalledWith("push_permission_result", { placement: "first_open", granted: true });
    expect(localStorage.getItem(PUSH_FIRST_ASK_KEY)).not.toBeNull();

    // The next launch is quiet.
    cleanup();
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(push.enablePush).toHaveBeenCalledTimes(1);
  });

  it("never asks a device that already answered, and remembers that too", async () => {
    push.permission = "granted";
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(push.enablePush).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith("push_permission_prompted", expect.anything());
    expect(localStorage.getItem(PUSH_FIRST_ASK_KEY)).not.toBeNull();
  });

  it("records a denial as asked and does nothing on the web or before the session user exists", async () => {
    push.enablePush.mockResolvedValueOnce("denied");
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(track).toHaveBeenCalledWith("push_permission_result", { placement: "first_open", granted: false });
    expect(localStorage.getItem(PUSH_FIRST_ASK_KEY)).not.toBeNull();
    cleanup();
    localStorage.clear();

    push.available = false;
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(push.enablePush).toHaveBeenCalledTimes(1);
    cleanup();

    push.available = true;
    account.sessionUserId = null;
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(push.enablePush).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(PUSH_FIRST_ASK_KEY)).toBeNull();
  });
});
