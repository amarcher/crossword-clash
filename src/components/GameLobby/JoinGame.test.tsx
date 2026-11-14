// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { JoinGame } from "./JoinGame";

vi.mock("../../lib/playerName", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/playerName")>()),
  loadPlayerName: () => null,
}));

afterEach(cleanup);

describe("JoinGame focus on arrival", () => {
  it("focuses the game code field and lights its first cell, so a visitor can type the code at once", () => {
    const { container } = render(<MemoryRouter><JoinGame onJoin={vi.fn()} onBack={vi.fn()} loading={false} error={null} /></MemoryRouter>);
    expect(document.activeElement).toBe(screen.getByLabelText(/code/i, { selector: "input" }));
    const cells = container.querySelectorAll('[aria-hidden="true"] span');
    expect(cells[0].className).toContain("border-brand-500");
    expect(cells[1].className).not.toContain("border-brand-500");
  });

  it("hands the focus to the name field when a link already filled the code", () => {
    render(<MemoryRouter><JoinGame onJoin={vi.fn()} onBack={vi.fn()} loading={false} error={null} initialCode="ABC123" /></MemoryRouter>);
    expect(document.activeElement).toBe(document.getElementById("join-display-name"));
  });
});

describe("JoinGame arriving from the Race friends code card", () => {
  it("joins at once when the code and a name are already known, and only once", () => {
    const onJoin = vi.fn();
    const { rerender } = render(<MemoryRouter><JoinGame onJoin={onJoin} onBack={vi.fn()} loading={false} error={null} initialCode="ABC123" initialName="alicia" autoJoin /></MemoryRouter>);
    expect(onJoin).toHaveBeenCalledWith("ABC123", "alicia");
    rerender(<MemoryRouter><JoinGame onJoin={onJoin} onBack={vi.fn()} loading={false} error="No open room has that code" initialCode="ABC123" initialName="alicia" autoJoin /></MemoryRouter>);
    expect(onJoin).toHaveBeenCalledTimes(1);
  });

  it("waits on the form when there is no name yet, or the code came from a link", () => {
    const onJoin = vi.fn();
    render(<MemoryRouter><JoinGame onJoin={onJoin} onBack={vi.fn()} loading={false} error={null} initialCode="ABC123" autoJoin /></MemoryRouter>);
    render(<MemoryRouter><JoinGame onJoin={onJoin} onBack={vi.fn()} loading={false} error={null} initialCode="ABC123" initialName="alicia" /></MemoryRouter>);
    expect(onJoin).not.toHaveBeenCalled();
  });
});
