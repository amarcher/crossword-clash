// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../i18n/i18n";
import { SoloStartGate } from "./SoloStartGate";

const tick = (n: number) => { for (let i = 0; i < n; i++) act(() => { vi.advanceTimersByTime(1000); }); };

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

  const who = [
    { userId: "a", username: "ayang329", seconds: 97, friend: true },
    { userId: "m", username: "Minna", seconds: 125, friend: true },
  ];
  const raceWith = (over = {}) => ({ ready: true, candidates: who, plus: true, preselect: [] as string[], onPick: vi.fn(async () => true), onPitch: vi.fn(), ...over });

  it("asks who to race before any counting, with Play solo as the default; the count is the last thing", async () => {
    const onStart = vi.fn();
    const race = raceWith();
    render(<SoloStartGate title="Mouse House" race={race} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.getByText("ayang329 and 1 other friend solved this")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play solo" }));
    expect(race.onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    tick(3);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("loads the ticked solves, then counts; a solve that will not load keeps the choice open", async () => {
    const onStart = vi.fn();
    const race = raceWith({ preselect: ["m"], onPick: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) });
    render(<SoloStartGate title="Mouse House" race={race} onStart={onStart} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /ayang329/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Race 2 solves" })); });
    expect(race.onPick).toHaveBeenLastCalledWith(["m", "a"]);
    expect(screen.getByRole("alert").textContent).toBe("Couldn't load that solve. Try again.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Race 2 solves" })); });
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    tick(3);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("without Plus counts straight away, the offer one line that stops the count for the pitch", () => {
    const onStart = vi.fn();
    const race = raceWith({ plus: false });
    render(<SoloStartGate title="Mouse House" race={race} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    fireEvent.click(screen.getByTestId("start-race-pitch"));
    expect(race.onPitch).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("waits briefly for the list, then counts without it; an answer after that does not pull the card back", () => {
    const onStart = vi.fn();
    const { rerender } = render(<SoloStartGate title="Mouse House" race={raceWith({ ready: false, candidates: [] })} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Getting ready…");
    act(() => { vi.advanceTimersByTime(1200); });
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    rerender(<SoloStartGate title="Mouse House" race={raceWith()} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.queryByTestId("start-race-pick")).toBeNull();
    tick(3);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("offers a live race with a friend when there is someone to ask", () => {
    const onLive = vi.fn();
    render(<SoloStartGate title="Mouse House" onLive={onLive} onStart={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Race a friend live" }));
    expect(onLive).toHaveBeenCalledTimes(1);
  });
});
