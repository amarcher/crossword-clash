// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n/i18n";

const offer = vi.hoisted(() => ({ value: { day: "2026-11-10", streak: 23 } as null | { day: string; streak: number } }));
vi.mock("../../hooks/useSolveHistory", () => ({ useRepairOffer: () => offer.value }));
const account = vi.hoisted(() => ({ value: { plusReady: true, plus: false, openPaywall: vi.fn() } }));
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => account.value }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
vi.mock("../../lib/plus", async (orig) => ({ ...(await orig<typeof import("../../lib/plus")>()), plusEnabled: () => true }));
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));

const { StreakRepairCard } = await import("./StreakRepairCard");

afterEach(() => {
  cleanup();
  navigate.mockClear();
});

describe("StreakRepairCard", () => {
  it("shows a free player what Plus would save, and the pitch", () => {
    render(<StreakRepairCard />);
    expect(screen.getByText("Repair your 23-day streak")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Repair with Plus" }));
    expect(account.value.openPaywall).toHaveBeenCalledWith({ placement: "streak", feature: "streak" });
  });

  it("sends a Plus player to the missed day's mini", () => {
    account.value = { ...account.value, plus: true };
    render(<StreakRepairCard />);
    fireEvent.click(screen.getByRole("button", { name: "Solve it" }));
    expect(navigate).toHaveBeenCalledWith("/daily/2026-11-10/mini");
  });

  it("shows nothing without an offer", () => {
    offer.value = null;
    const { container } = render(<StreakRepairCard />);
    expect(container.textContent).toBe("");
  });
});
