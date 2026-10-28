// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UpdateBanner } from "./UpdateBanner";
import type { AppUpdate } from "../hooks/useAppUpdate";

const hook: { value: AppUpdate } = { value: null as unknown as AppUpdate };
vi.mock("../hooks/useAppUpdate", () => ({ useAppUpdate: () => hook.value }));

beforeEach(() => {
  hook.value = { available: false, update: vi.fn(), dismiss: vi.fn() };
});
afterEach(cleanup);

describe("UpdateBanner", () => {
  it("renders nothing while no update is on offer", () => {
    expect(render(<UpdateBanner />).container.innerHTML).toBe("");
  });

  it("names the store's version with Update and Later", () => {
    const update = vi.fn();
    const dismiss = vi.fn();
    hook.value = { available: true, version: "1.2.0", update, dismiss };
    render(<UpdateBanner />);
    const banner = screen.getByRole("region", { name: "App update" });
    expect(banner.textContent).toContain("Crossword Clash 1.2.0 is available");
    expect(banner.textContent).toContain("New puzzles, fixes and features");
    fireEvent.click(screen.getByRole("button", { name: "Update" }));
    expect(update).toHaveBeenCalledTimes(1);
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it("says a new version is available when the platform gives no version name (Android)", () => {
    hook.value = { available: true, update: vi.fn(), dismiss: vi.fn() };
    render(<UpdateBanner />);
    expect(screen.getByRole("region", { name: "App update" }).textContent).toContain("A new version of Crossword Clash is available");
  });
});
