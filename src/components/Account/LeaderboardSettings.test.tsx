// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import { LeaderboardSettings } from "./LeaderboardSettings";
const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("../../lib/leaderboardPreference", () => ({ fetchSoloLeaderboardPreference: mocks.read, saveSoloLeaderboardPreference: mocks.save }));
beforeEach(() => { vi.clearAllMocks(); mocks.read.mockResolvedValue(true); mocks.save.mockResolvedValue(undefined); });
afterEach(cleanup);
it("loads the account default and saves an opt-out", async () => {
  render(<LeaderboardSettings userId="me" />);
  const toggle = screen.getByRole("switch", { name: "Leaderboard eligible" });
  await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
  expect(mocks.save).toHaveBeenCalledWith("me", false);
});
it("does not pretend a failed save succeeded", async () => {
  mocks.save.mockRejectedValue(new Error("offline"));
  render(<LeaderboardSettings userId="me" />);
  const toggle = screen.getByRole("switch");
  await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  fireEvent.click(toggle);
  await screen.findByRole("alert");
  expect(toggle.getAttribute("aria-checked")).toBe("true");
});
it("waits for a failed read to be retried before enabling the control", async () => {
  mocks.read.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(false);
  render(<LeaderboardSettings userId="me" />);
  fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
  await waitFor(() => expect(screen.getByRole("switch")).toHaveProperty("disabled", false));
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
});
