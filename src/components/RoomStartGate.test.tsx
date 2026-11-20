// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../i18n/i18n";
import { RoomStartGate } from "./RoomStartGate";
import type { Puzzle } from "../types/puzzle";

const puzzle = {
  title: "Mouse House", author: "", width: 1, height: 1, clues: [],
  cells: [[{ row: 0, col: 0, solution: "A", number: 1 }]],
} as unknown as Puzzle;

describe("RoomStartGate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("counts down to the moment the host set, and holds at 1 until the game starts", () => {
    render(<RoomStartGate puzzle={puzzle} startsAtMs={Date.now() + 10_000} />);
    expect(screen.getByRole("dialog", { name: "Mouse House" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Starting in 10…");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(screen.getByRole("status").textContent).toBe("Starting in 6…");
    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.getByRole("status").textContent).toBe("Starting in 1…");
  });

  it("gives only the host a way to call it off", () => {
    const onCancel = vi.fn();
    const { rerender } = render(<RoomStartGate puzzle={puzzle} startsAtMs={Date.now() + 10_000} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<RoomStartGate puzzle={puzzle} startsAtMs={Date.now() + 10_000} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
