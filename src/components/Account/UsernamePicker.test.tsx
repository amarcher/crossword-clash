// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { UsernamePicker } from "./UsernamePicker";

const lib = vi.hoisted(() => ({
  isUsernameTaken: vi.fn<(name: string, except?: string) => Promise<boolean>>(),
  saveUsername: vi.fn(),
}));
vi.mock("../../lib/account", () => ({ isUsernameTaken: lib.isUsernameTaken, saveUsername: lib.saveUsername }));
const playerName = vi.hoisted(() => ({ savePlayerName: vi.fn() }));
vi.mock("../../lib/playerName", () => playerName);

const PROPS = { userId: "u1", current: null, suggestFrom: "Ada Lovelace", onSaved: vi.fn(), onCancel: vi.fn(), cancelLabel: "Later" };

beforeEach(() => {
  vi.useFakeTimers();
  lib.isUsernameTaken.mockResolvedValue(false);
  lib.saveUsername.mockReset();
  PROPS.onSaved = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const input = () => screen.getByLabelText("Username") as HTMLInputElement;
const save = () => screen.getByRole("button", { name: /Save username/ }) as HTMLButtonElement;
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
};

describe("UsernamePicker", () => {
  it("starts from the provider name and checks availability once typing pauses", async () => {
    render(<UsernamePicker {...PROPS} />);
    expect(input().value).toBe("AdaLovelace");
    expect(screen.getByText("Checking…")).toBeTruthy();
    expect(save().disabled).toBe(true);
    await settle();
    expect(lib.isUsernameTaken).toHaveBeenCalledWith("AdaLovelace", "u1");
    expect(screen.getByText("Available")).toBeTruthy();
    expect(save().disabled).toBe(false);
  });

  it("explains the rule broken instead of asking the server", async () => {
    render(<UsernamePicker {...PROPS} />);
    fireEvent.change(input(), { target: { value: "ab" } });
    expect(screen.getByText("At least 3 characters")).toBeTruthy();
    fireEvent.change(input(), { target: { value: "ad a!" } });
    expect(input().value).toBe("ada!");
    expect(screen.getByText("Letters, numbers and underscores only")).toBeTruthy();
    await settle();
    expect(lib.isUsernameTaken).toHaveBeenCalledTimes(1); // only the initial suggestion
    expect(save().disabled).toBe(true);
  });

  it("reports a taken name and blocks saving", async () => {
    lib.isUsernameTaken.mockResolvedValue(true);
    render(<UsernamePicker {...PROPS} />);
    await settle();
    expect(screen.getByText("Already taken")).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it("saves, remembers the name for games, and hands back the profile", async () => {
    const profile = { user_id: "u1", username: "AdaLovelace", display_name: null };
    lib.saveUsername.mockResolvedValue({ ok: true, profile });
    render(<UsernamePicker {...PROPS} />);
    await settle();
    await act(async () => {
      fireEvent.submit(save().closest("form")!);
    });
    expect(lib.saveUsername).toHaveBeenCalledWith("u1", "AdaLovelace");
    expect(playerName.savePlayerName).toHaveBeenCalledWith("AdaLovelace");
    expect(PROPS.onSaved).toHaveBeenCalledWith(profile);
  });

  it("shows a race-lost 'taken' from the server", async () => {
    lib.saveUsername.mockResolvedValue({ ok: false, reason: "taken" });
    render(<UsernamePicker {...PROPS} />);
    await settle();
    await act(async () => {
      fireEvent.submit(save().closest("form")!);
    });
    expect(screen.getByText("Already taken")).toBeTruthy();
    expect(PROPS.onSaved).not.toHaveBeenCalled();
  });

  it("treats the current username as unchanged, so there is nothing to save", () => {
    render(<UsernamePicker {...PROPS} current="ada_l" />);
    expect(input().value).toBe("ada_l");
    expect(screen.queryByText("Checking…")).toBeNull();
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(PROPS.onCancel).toHaveBeenCalled();
  });
});
