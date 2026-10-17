// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NavigationProgress, PROGRESS_DELAY_MS } from "./NavigationProgress";
import "../i18n/i18n";

let navState: "idle" | "loading" | "submitting" = "idle";
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  useNavigation: () => ({ state: navState }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  navState = "idle";
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("NavigationProgress", () => {
  it("shows nothing while idle", () => {
    render(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("appears only once a navigation has been loading for the delay, then hides on settle", () => {
    navState = "loading";
    const { rerender } = render(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS - 1));
    expect(screen.queryByRole("progressbar")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-label")).toBe("Loading page…");

    navState = "idle";
    rerender(<NavigationProgress />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("never flashes for a hop that settles inside the delay", () => {
    navState = "loading";
    const { rerender } = render(<NavigationProgress />);
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS / 2));
    navState = "idle";
    rerender(<NavigationProgress />);
    act(() => vi.advanceTimersByTime(PROGRESS_DELAY_MS));
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
