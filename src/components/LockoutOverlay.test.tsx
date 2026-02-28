// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { LockoutOverlay } from "./LockoutOverlay";

afterEach(cleanup);

describe("LockoutOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when lockedUntil is 0", () => {
    const { container } = render(<LockoutOverlay lockedUntil={0} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when lockedUntil is in the past", () => {
    vi.setSystemTime(new Date(10000));
    const { container } = render(<LockoutOverlay lockedUntil={5000} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders countdown when lockedUntil is in the future", () => {
    vi.setSystemTime(new Date(10000));
    render(<LockoutOverlay lockedUntil={13000} />);
    expect(screen.getByText("3.0s")).toBeDefined();
  });

  it("ticks down over time", () => {
    vi.setSystemTime(new Date(10000));
    render(<LockoutOverlay lockedUntil={13000} />);
    expect(screen.getByText("3.0s")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(100);
      vi.setSystemTime(new Date(10100));
    });

    // After 100ms tick, should show ~2.9s
    expect(screen.getByText("2.9s")).toBeDefined();
  });

  it("disappears when timer expires", () => {
    vi.setSystemTime(new Date(10000));
    const { container } = render(<LockoutOverlay lockedUntil={11000} />);
    expect(screen.getByText("1.0s")).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(1100);
      vi.setSystemTime(new Date(11100));
    });

    expect(container.querySelector(".lockout-pulse")).toBeNull();
  });

  it("has the lockout-pulse CSS class", () => {
    vi.setSystemTime(new Date(10000));
    const { container } = render(<LockoutOverlay lockedUntil={13000} />);
    expect(container.querySelector(".lockout-pulse")).not.toBeNull();
  });

  it("is non-interactive (pointer-events-none)", () => {
    vi.setSystemTime(new Date(10000));
    const { container } = render(<LockoutOverlay lockedUntil={13000} />);
    const overlay = container.firstElementChild as HTMLElement;
    expect(overlay.className).toContain("pointer-events-none");
  });
});
