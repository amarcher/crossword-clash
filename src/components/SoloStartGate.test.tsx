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
  const raceWith = (over = {}) => ({ ready: true, candidates: who, preselect: [] as string[], onPick: vi.fn(async () => true), ...over });

  it("asks how to play before any counting; Play solo then counts, the last thing before the grid", () => {
    const onStart = vi.fn();
    const race = raceWith();
    const live = { names: ["ben", "julie"], onChoose: vi.fn() };
    render(<SoloStartGate title="Mouse House" race={race} live={live} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.getByText("How do you want to play?")).toBeTruthy();
    expect(screen.getByText("ayang329 and Minna")).toBeTruthy();
    expect(screen.getByText("ben and julie")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Play solo/ }));
    expect(race.onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    tick(3);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("Race a finished solve opens the list; the ticked solves load, then it counts saying who; a failed load keeps the list", async () => {
    const onStart = vi.fn();
    const race = raceWith({ onPick: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true) });
    render(<SoloStartGate title="Mouse House" race={race} onStart={onStart} onBack={vi.fn()} />);
    fireEvent.click(screen.getByTestId("start-ask-race"));
    expect((screen.getByRole("button", { name: "Pick a solve" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Minna/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /ayang329/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Race 2 solves" })); });
    expect(race.onPick).toHaveBeenLastCalledWith(["m", "a"]);
    expect(screen.getByRole("alert").textContent).toBe("Couldn't load that solve. Try again.");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Race 2 solves" })); });
    expect(screen.getByText("Racing Minna and ayang329")).toBeTruthy();
    tick(3);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("opens on the list with the racer ticked after a Race tap on a leaderboard row", () => {
    render(<SoloStartGate title="Mouse House" race={raceWith({ preselect: ["m"] })} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Race 1 solve" })).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: /Minna/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("Go back from a list opened by a Race tap leaves the puzzle; from a list reached through the options it returns to them", () => {
    const onBack = vi.fn();
    const first = render(<SoloStartGate title="Mouse House" race={raceWith({ preselect: ["m"] })} onStart={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<SoloStartGate title="Mouse House" race={raceWith()} onStart={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByTestId("start-ask-race"));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("start-ask-race")).toBeTruthy();
  });

  it("Race friends live leaves for the live room, offered even when nobody has a solve to race", () => {
    const live = { names: ["ben"], onChoose: vi.fn() };
    render(<SoloStartGate title="Mouse House" race={raceWith({ candidates: [] })} live={live} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("ben")).toBeTruthy();
    expect(screen.queryByTestId("start-ask-race")).toBeNull();
    fireEvent.click(screen.getByTestId("start-ask-live"));
    expect(live.onChoose).toHaveBeenCalledTimes(1);
  });

  it("offers a live room to a player with no friends, under its name alone", () => {
    render(<SoloStartGate title="Mouse House" race={raceWith({ candidates: [] })} live={{ names: [], onChoose: vi.fn() }} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText("How do you want to play?")).toBeTruthy();
    expect(screen.getByTestId("start-ask-live").textContent).toBe("Race friends live");
  });

  it("with nobody to race either way, and when solo was already chosen, it is the countdown alone", () => {
    const { unmount } = render(<SoloStartGate title="Mouse House" race={raceWith({ candidates: [] })} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    unmount();
    render(<SoloStartGate title="Mouse House" answered race={raceWith({ ready: false })} live={{ names: ["ben"], onChoose: vi.fn() }} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    expect(screen.queryByTestId("start-ask")).toBeNull();
  });

  it("shows the options on the first frame when a room can be made, before the list answers; the list then adds its row", () => {
    const live = { names: [], onChoose: vi.fn() };
    const { rerender } = render(<SoloStartGate title="Mouse House" race={raceWith({ ready: false, candidates: [] })} live={live} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("start-ask")).toBeTruthy();
    expect(screen.queryByTestId("start-ask-race")).toBeNull();
    rerender(<SoloStartGate title="Mouse House" race={raceWith()} live={live} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("start-ask-race")).toBeTruthy();
  });

  it("never shows the count while a list that decides the screen is awaited", () => {
    render(<SoloStartGate title="Mouse House" race={raceWith({ ready: false, candidates: [] })} onStart={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId("start-waiting")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start now" })).toBeNull();
  });

  it("waits briefly for the list, then counts without it; an answer after that does not pull the card back", () => {
    const onStart = vi.fn();
    const { rerender } = render(<SoloStartGate title="Mouse House" race={raceWith({ ready: false, candidates: [] })} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.getByRole("status").textContent).toBe("Getting ready…");
    act(() => { vi.advanceTimersByTime(1200); });
    expect(screen.getByRole("status").textContent).toBe("Starting in 3…");
    rerender(<SoloStartGate title="Mouse House" race={raceWith()} onStart={onStart} onBack={vi.fn()} />);
    expect(screen.queryByTestId("start-ask")).toBeNull();
    tick(3);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
