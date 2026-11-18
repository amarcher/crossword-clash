// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../i18n/i18n";
import { SoloStartGate } from "./SoloStartGate";

describe("SoloStartGate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("counts 3, 2, 1 and then starts on its own, once", () => {
    const onStart = vi.fn();
    render(<SoloStartGate title="Mouse House" detail="5×5 · 10 clues" onStart={onStart} onBack={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Mouse House" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole("status").textContent).toBe("Starting in 2…");
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onStart).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("starts at once on Start now, and leaves on Go back or Escape without starting", () => {
    const onStart = vi.fn();
    const onBack = vi.fn();
    render(<SoloStartGate title="Mouse House" onStart={onStart} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Start now" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
