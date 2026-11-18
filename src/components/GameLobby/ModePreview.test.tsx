// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";
import { ModePreview } from "./ModePreview";
import { GameLobby } from "./GameLobby";
import type { Player } from "../../types/game";

function motion(reduced: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced, addEventListener() {}, removeEventListener() {} }) as never;
}
const letters = () => screen.getByTestId("mode-preview").querySelectorAll("div > span:not(:empty)").length;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ModePreview", () => {
  it("is one named picture and fills in a square at a time", () => {
    motion(false);
    render(<ModePreview mode="versus" label="One shared grid." />);
    expect(screen.getByRole("img", { name: "One shared grid." })).toBeTruthy();
    act(() => void vi.advanceTimersByTime(420));
    expect(letters()).toBe(0);
    act(() => void vi.advanceTimersByTime(420 * 5));
    expect(letters()).toBe(5);
  });

  it("holds one still frame under reduced motion", () => {
    motion(true);
    render(<ModePreview mode="coop" label="Together." />);
    const before = letters();
    expect(before).toBeGreaterThan(0);
    act(() => void vi.advanceTimersByTime(5000));
    expect(letters()).toBe(before);
    expect(screen.getByText("Together: 10 of 16")).toBeTruthy();
  });
});

describe("GameLobby game mode", () => {
  const players = [
    { id: "1", gameId: "g", userId: "h", displayName: "Host", color: "#3b82f6", score: 0 },
    { id: "2", gameId: "g", userId: "j", displayName: "Joiner", color: "#ef4444", score: 0 },
  ] as unknown as Player[];
  const base = { shareCode: "ABC123", players, onStartGame() {}, onCloseRoom() {} };

  it("shows a joiner the mode the host picked, with its preview", () => {
    motion(true);
    render(<MemoryRouter><GameLobby {...base} isHost={false} raceMode="coop" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Game mode" })).toBeTruthy();
    expect(screen.getByText("Co-op")).toBeTruthy();
    expect(screen.getByTestId("mode-preview").getAttribute("data-mode")).toBe("coop");
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("shows a joiner nothing about the mode until the host has said it", () => {
    motion(true);
    render(<MemoryRouter><GameLobby {...base} isHost={false} /></MemoryRouter>);
    expect(screen.queryByTestId("mode-preview")).toBeNull();
  });

  it("gives the host the picker with the selected mode's preview", () => {
    motion(true);
    render(<MemoryRouter><GameLobby {...base} isHost raceMode="async" onRaceModeChange={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("radiogroup", { name: "Game mode" })).toBeTruthy();
    expect(screen.getByTestId("mode-preview").getAttribute("data-mode")).toBe("async");
  });
});
