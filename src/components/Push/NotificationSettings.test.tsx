// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import { DEFAULT_PUSH_PREFS, type PushPrefs } from "../../lib/pushRules";

const push = vi.hoisted(() => ({
  available: true,
  permission: "prompt" as "prompt" | "granted" | "denied",
  prefs: null as PushPrefs | null,
  enablePush: vi.fn(async () => "granted" as "granted" | "denied" | "prompt"),
  registerPushToken: vi.fn(async () => "tok"),
  savePushPrefs: vi.fn(async (_u: string, p: Partial<PushPrefs>) => ({ ...DEFAULT_PUSH_PREFS, ...p })),
}));
vi.mock("../../lib/push", () => ({
  pushAvailable: () => push.available,
  checkPushPermission: async () => push.permission,
  fetchPushPrefs: async () => push.prefs,
  enablePush: push.enablePush,
  registerPushToken: push.registerPushToken,
  savePushPrefs: push.savePushPrefs,
}));
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => ({ sessionUserId: "u1" }) }));
const track = vi.hoisted(() => vi.fn());
vi.mock("../../lib/analytics", () => ({ track }));

const { NotificationSettings } = await import("./NotificationSettings");
const { ReminderSwitch } = await import("./ReminderSwitch");

beforeEach(() => {
  push.available = true;
  push.permission = "prompt";
  push.prefs = null;
  push.enablePush.mockClear().mockResolvedValue("granted");
  push.registerPushToken.mockClear();
  push.savePushPrefs.mockClear();
  track.mockClear();
});
afterEach(cleanup);

describe("NotificationSettings", () => {
  it("renders nothing on the web", () => {
    push.available = false;
    expect(render(<NotificationSettings />).container.innerHTML).toBe("");
  });

  it("shows the switches off by default for the reminder and on for invites and requests, and asks the OS only when a switch is turned on", async () => {
    render(<NotificationSettings placement="account" />);
    const reminder = await screen.findByRole("switch", { name: "Daily puzzle reminder" });
    expect(reminder.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "Room invites" }).getAttribute("aria-checked")).toBe("true");
    expect(push.enablePush).not.toHaveBeenCalled();
    fireEvent.click(reminder);
    await waitFor(() => expect(push.enablePush).toHaveBeenCalledWith("u1", expect.objectContaining({ locale: expect.any(String) })));
    await waitFor(() => expect(push.savePushPrefs).toHaveBeenCalledWith("u1", expect.objectContaining({ daily_reminder: true })));
    expect(track).toHaveBeenCalledWith("push_permission_prompted", { placement: "account" });
    expect(track).toHaveBeenCalledWith("push_permission_result", { placement: "account", granted: true });
    expect(track).toHaveBeenCalledWith("reminder_toggled", { on: true, hour: 8, placement: "account" });
    expect((await screen.findByRole("switch", { name: "Daily puzzle reminder" })).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("combobox", { name: "Remind me at" })).toBeTruthy();
  });

  it("leaves the switch off after a denial and says where to allow notifications", async () => {
    push.enablePush.mockResolvedValue("denied");
    render(<NotificationSettings />);
    fireEvent.click(await screen.findByRole("switch", { name: "Daily puzzle reminder" }));
    expect(await screen.findByText("Notifications are off for Crossword Clash")).toBeTruthy();
    expect(push.savePushPrefs).not.toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Daily puzzle reminder" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "Daily puzzle reminder" })).toHaveProperty("disabled", true);
  });

  it("with permission already granted, saves without a prompt and refreshes the token; the quiet-hours row nests the invites exception", async () => {
    push.permission = "granted";
    push.prefs = { ...DEFAULT_PUSH_PREFS, room_invites: false };
    render(<NotificationSettings />);
    const invites = await screen.findByRole("switch", { name: "Room invites" });
    expect(invites.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(invites);
    await waitFor(() => expect(push.savePushPrefs).toHaveBeenCalledWith("u1", expect.objectContaining({ room_invites: true })));
    expect(push.enablePush).not.toHaveBeenCalled();
    expect(push.registerPushToken).toHaveBeenCalled();
    expect(screen.getByRole("switch", { name: "Still let room invites through" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("ReminderSwitch", () => {
  it("offers the reminder after a daily until it is on, and turns it on with the prompt in context", async () => {
    render(<ReminderSwitch />);
    const row = await screen.findByRole("button", { name: /Remind me tomorrow/ });
    fireEvent.click(row);
    await waitFor(() => expect(push.enablePush).toHaveBeenCalled());
    await waitFor(() => expect(push.savePushPrefs).toHaveBeenCalledWith("u1", expect.objectContaining({ daily_reminder: true })));
    expect(track).toHaveBeenCalledWith("push_permission_prompted", { placement: "completion" });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Remind me tomorrow/ })).toBeNull());
  });

  it("renders nothing once the reminder is on, after a denial, or on the web", async () => {
    push.prefs = { ...DEFAULT_PUSH_PREFS, daily_reminder: true };
    const on = render(<ReminderSwitch />);
    await waitFor(() => expect(on.container.innerHTML).toBe(""));
    cleanup();
    push.prefs = null;
    push.permission = "denied";
    const denied = render(<ReminderSwitch />);
    await waitFor(() => expect(denied.container.innerHTML).toBe(""));
    cleanup();
    push.available = false;
    expect(render(<ReminderSwitch />).container.innerHTML).toBe("");
  });
});
