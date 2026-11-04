// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import type { Puzzle } from "../types/puzzle";

/**
 * Every route has a way out (Andrew, 2026-11-03: the TV chooser shipped with
 * none). The pages that had none: the importer hubs without a back label, the
 * challenge page, the two rejoin spinners and the simple TV screens.
 */
const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});
const session = vi.hoisted(() => ({ clearMpSession: vi.fn(), clearHostSession: vi.fn(), loadHostSession: vi.fn(() => null) }));
vi.mock("../lib/sessionPersistence", () => session);
vi.mock("../layouts/RootLayout", () => ({ useRejoinEffect: () => {} }));
const puzzle: Puzzle = { title: "Civics Class", author: "CC", width: 1, height: 1, cells: [[{ row: 0, col: 0, solution: "A" }]], clues: [{ direction: "across", number: 1, text: "Clue", row: 0, col: 0, length: 1, answer: "A" }] };
const host = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../layouts/HostLayout", () => ({ useHostContext: () => host.value }));
const game = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("../contexts/GameContext", () => ({ useGame: () => game.value }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../components/AdSlot", () => ({ AdSlot: () => null }));
vi.mock("../components/NytRecommendation", () => ({ NytRecommendation: () => null }));

const { PuzzleImporter } = await import("../components/PuzzleImporter/PuzzleImporter");
const { ChallengeScreen } = await import("./ChallengeScreen");
const { RejoinScreen } = await import("./RejoinScreen");
const { HostMenuScreen } = await import("./host/HostMenuScreen");
const { HostPuzzleReadyScreen } = await import("./host/HostPuzzleReadyScreen");
const { HostRejoinScreen } = await import("./host/HostRejoinScreen");

const at = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const link = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

beforeEach(() => {
  navigate.mockClear();
  session.clearMpSession.mockClear();
  session.clearHostSession.mockClear();
  host.value = { user: { id: "u1" }, urlPuzzle: puzzle, handlePuzzleLoaded: vi.fn(), loadPuzzle: vi.fn(), dispatch: vi.fn() };
  game.value = { urlPuzzle: puzzle, urlChallenge: { name: "Alicia", seconds: 90 }, handleSoloPuzzleLoaded: vi.fn(async () => {}) };
});
afterEach(cleanup);

describe("every page has a way out", () => {
  it("the importer hub falls back to Back to menu when a caller passes no back control, and keeps one it is given", () => {
    at(<PuzzleImporter onPuzzleLoaded={vi.fn()} />);
    expect(link("Back to menu")).toBe("/menu");
    cleanup();
    at(<PuzzleImporter onPuzzleLoaded={vi.fn()} backTo="/host-game/name" backLabel="Back" />);
    expect(link("Back")).toBe("/host-game/name");
  });

  it("the challenge page has Back to menu beside its one action", () => {
    at(<ChallengeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));
    expect(navigate).toHaveBeenCalledWith("/menu");
  });

  it("the rejoin spinner's Back to menu drops the room session so the index does not walk back in", () => {
    at(<RejoinScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));
    expect(session.clearMpSession).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/menu", { replace: true });
  });

  it("the TV landing and puzzle-ready screens link back to the menu, the latter also to another puzzle", () => {
    host.value = { ...host.value, user: null };
    at(<HostMenuScreen />);
    expect(link("Back to menu")).toBe("/menu");
    cleanup();
    host.value = { ...host.value, user: { id: "u1" } };
    at(<HostPuzzleReadyScreen />);
    expect(link("Back to menu")).toBe("/menu");
    expect(link("Choose another puzzle")).toBe("/host/import");
    expect(screen.getByRole("button", { name: /Host game/i })).toBeTruthy();
  });

  it("the TV rejoin spinner's Back to menu drops the host session", () => {
    at(<HostRejoinScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Back to menu" }));
    expect(session.clearHostSession).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/menu", { replace: true });
  });
});
