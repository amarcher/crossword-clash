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
