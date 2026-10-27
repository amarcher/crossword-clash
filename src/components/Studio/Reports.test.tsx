// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ModerationQueue, QueuePuzzle } from "../../lib/studioModerate";

const moderate = vi.hoisted(() => ({ fetchModerationQueue: vi.fn(), moderatePuzzle: vi.fn() }));
vi.mock("../../lib/studioModerate", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/studioModerate")>()), ...moderate }));
vi.mock("../../hooks/useStudioToken", () => ({ useStudioToken: () => "", setStudioToken: vi.fn() }));

const { Reports } = await import("./Reports");

const puzzle = (n: number, overrides: Partial<QueuePuzzle> = {}): QueuePuzzle => ({
  id: `row-${n}`, short_id: `short${n}xx`, author_id: "ada-id", author: "ada", studio_id: `p-${n}`, status: "published", title: `Puzzle ${n}`, notes: "",
  difficulty: "medium", lang: "en", width: 5, height: 5, clue_count: 10,
  puzzle: { title: `Puzzle ${n}`, author: "ada", size: { rows: 3, cols: 3 }, grid: ["C", "A", "T", "O", "R", "E", "W", "E", "D"], gridnums: [1, 2, 3, 4, 0, 0, 5, 0, 0], clues: { across: ["1. Tabby", "4. Mined rock", "5. Tied the knot"], down: ["1. Dairy animal", "2. Exist", "3. Talk series"] }, answers: { across: ["CAT", "ORE", "WED"], down: ["COW", "ARE", "TED"] } },
  plays: 3, solves: 1, published_at: "2026-10-28T00:00:00Z", removed_reason: null, moderated_at: null, moderation_note: null, ...overrides,
});

const queue: ModerationQueue = {
  items: [
    {
      puzzle: puzzle(1, { status: "held" }),
      publisher: { user_id: "ada-id", strikes: 2, banned_at: null },
      reports: [
        { id: "r1", reason: "copied", details: "It's the 2019 Times.", created_at: "2026-10-28T10:00:00Z" },
        { id: "r2", reason: "copied", details: "", created_at: "2026-10-28T11:00:00Z" },
        { id: "r3", reason: "nonsense", details: "", created_at: "2026-10-28T12:00:00Z" },
      ],
    },
    { puzzle: puzzle(2), publisher: null, reports: [{ id: "r4", reason: "other", details: "", created_at: "2026-10-27T10:00:00Z" }] },
  ],
  removed: [puzzle(3, { status: "removed", removed_reason: "offensive", moderated_at: "2026-10-26T00:00:00Z" })],
};

beforeEach(() => {
  moderate.fetchModerationQueue.mockReset().mockResolvedValue(queue);
  moderate.moderatePuzzle.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("Reports (admin queue)", () => {
  it("asks for a sign-in or the token when it has neither", () => {
    render(<Reports admin={false} />);
    expect(screen.getByText("Sign in as a studio admin, or enter the studio token.")).toBeTruthy();
    expect(moderate.fetchModerationQueue).not.toHaveBeenCalled();
  });

  it("lists reported puzzles held first with reasons, notes, strikes and a play-test link", async () => {
    render(<Reports admin />);
    expect(await screen.findByText("Puzzle 1")).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("Puzzle 1");
    expect(items[0].textContent).toContain("held");
    expect(items[0].textContent).toContain("copied ×2 · nonsense ×1");
    expect(items[0].textContent).toContain("2 strikes");
    expect(items[0].textContent).toContain("“It's the 2019 Times.”");
    expect(screen.getByText("Puzzle 1").getAttribute("href")).toBe("/puzzles/short1xx");
    expect(screen.getAllByText("Play test")[0].getAttribute("href")).toMatch(/^\/#puzzle=/);
  });

  it("dismisses and refetches", async () => {
    render(<Reports admin />);
    await screen.findByText("Puzzle 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[1]);
    await waitFor(() => expect(moderate.moderatePuzzle).toHaveBeenCalledWith("", "dismiss", "row-2", undefined, undefined));
    expect(moderate.fetchModerationQueue).toHaveBeenCalledTimes(2);
  });

  it("removes with the top reason and a note, defaulting to stop the author on the third strike", async () => {
    render(<Reports admin />);
    await screen.findByText("Puzzle 1");
    fireEvent.click(screen.getAllByRole("button", { name: "Remove…" })[0]);
    const ban = screen.getByRole("checkbox") as HTMLInputElement;
    expect(ban.checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Note to the author"), { target: { value: "Copied from a published puzzle." } });
    fireEvent.click(screen.getByRole("button", { name: "Remove and stop author" }));
    await waitFor(() => expect(moderate.moderatePuzzle).toHaveBeenCalledWith("", "ban", "row-1", "copied", "Copied from a published puzzle."));
  });

  it("restores a recently removed puzzle", async () => {
    render(<Reports admin />);
    await screen.findByText("Puzzle 1");
    fireEvent.click(screen.getByText(/Recently removed/));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() => expect(moderate.moderatePuzzle).toHaveBeenCalledWith("", "restore", "row-3", undefined, undefined));
  });

  it("says when there is nothing open", async () => {
    moderate.fetchModerationQueue.mockResolvedValue({ items: [], removed: [] });
    render(<Reports admin />);
    expect(await screen.findByText("No open reports.")).toBeTruthy();
  });
});
