// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";

/**
 * The permission asks (Andrew, 2026-11-13): our own question first, the OS
 * sheet only after a yes. One on the first open, one after a daily's finish
 * dialog closes for a device the OS has not asked; each once per device.
 */
const push = vi.hoisted(() => ({
  available: true,
  permission: "prompt" as "prompt" | "granted" | "denied",
  enablePush: vi.fn(async () => "granted" as "granted" | "denied" | "prompt"),
  registerPushToken: vi.fn(async () => "tok"),
  savePushPrefs: vi.fn(async (_id: string, p: Record<string, unknown>) => ({ daily_reminder_hour: 9, ...p })),
}));
vi.mock("../../lib/push", () => ({
  PUSH_TOKEN_KEY: "crossword-clash:push-token",
  pushAvailable: () => push.available,
  checkPushPermission: async () => push.permission,
  enablePush: push.enablePush,
  registerPushToken: push.registerPushToken,
  DAILY_FINISH_CLOSED_EVENT: "crossword-clash:daily-finish-closed",
  fetchPushPrefs: async () => null,
  savePushPrefs: push.savePushPrefs,
  startPushTaps: () => () => {},
}));
const account = vi.hoisted(() => ({ sessionUserId: "u1" as string | null }));
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => ({ sessionUserId: account.sessionUserId }) }));
const track = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ track }));

const { PushEffects, PUSH_FIRST_ASK_KEY, PUSH_REMINDER_ASK_KEY, FIRST_ASK_DELAY_MS } = await import("./PushEffects");

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
  push.savePushPrefs.mockClear();
  account.sessionUserId = "u1";
  track.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const click = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
    await vi.advanceTimersByTimeAsync(0);
  });
const closeFinish = () =>
  act(async () => {
    window.dispatchEvent(new Event("crossword-clash:daily-finish-closed"));
    await vi.advanceTimersByTimeAsync(0);
  });

describe("PushEffects first-open ask", () => {
  it("asks in our own words first, and shows the OS sheet only after Enable", async () => {
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS - 1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await elapse(1);
    expect(screen.getByRole("dialog", { name: "Crossword Clash is better with notifications" })).toBeTruthy();
    expect(push.enablePush).not.toHaveBeenCalled();
    // Not now on the left, Enable on the right.
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Not now", "Enable"]);

    await click("Enable");
    expect(push.enablePush).toHaveBeenCalledWith("u1", { locale: "en" });
    expect(track).toHaveBeenCalledWith("push_permission_result", { placement: "first_open", granted: true });
    expect(push.savePushPrefs).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(PUSH_FIRST_ASK_KEY)).not.toBeNull();

    // The next launch is quiet.
    cleanup();
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Not now never shows the OS sheet and is not asked again on the next launch", async () => {
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS);
    await click("Not now");
    expect(push.enablePush).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith("push_ask_declined", { placement: "first_open" });
    cleanup();
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never asks a device that already answered, on the web, or before the session user exists", async () => {
    push.permission = "granted";
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(PUSH_FIRST_ASK_KEY)).not.toBeNull();
    cleanup();
    localStorage.clear();

    push.permission = "prompt";
    push.available = false;
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();

    push.available = true;
    account.sessionUserId = null;
    renderEffects();
    await elapse(FIRST_ASK_DELAY_MS + 1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(PUSH_FIRST_ASK_KEY)).toBeNull();
  });
});

describe("PushEffects reminder ask", () => {
  it("asks once after a daily's finish dialog closes, and a yes turns the reminder on", async () => {
    localStorage.setItem(PUSH_FIRST_ASK_KEY, "x"); // said Not now at first open
    renderEffects();
    await closeFinish();
    expect(screen.getByRole("dialog", { name: "Want a reminder tomorrow?" })).toBeTruthy();
    expect(push.enablePush).not.toHaveBeenCalled();
    await click("Remind me");
    expect(push.enablePush).toHaveBeenCalledTimes(1);
    expect(push.savePushPrefs).toHaveBeenCalledWith("u1", { daily_reminder: true });
    expect(localStorage.getItem(PUSH_REMINDER_ASK_KEY)).not.toBeNull();

    await closeFinish();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays quiet once the OS has an answer, and leaves the reminder off after a denial", async () => {
    localStorage.setItem(PUSH_FIRST_ASK_KEY, "x");
    push.permission = "denied";
    renderEffects();
    await closeFinish();
    expect(screen.queryByRole("dialog")).toBeNull();

    push.permission = "prompt";
    push.enablePush.mockResolvedValueOnce("denied");
    await closeFinish();
    await click("Remind me");
    expect(push.savePushPrefs).not.toHaveBeenCalled();
  });
});
