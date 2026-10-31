// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { HostNameScreen } from "./HostNameScreen";

/**
 * The host name screen's username prefill. The profile loads a beat after
 * the screen, so the prefill must never land on top of a name the player
 * has already started typing (Andrew typed "Arch", the room was created as
 * "Archer").
 */
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => vi.fn() };
});

// The real screen reads and writes game.displayName, so the mocked context
// keeps it in React state (only this screen calls useGame here).
const gameStatic = {
  urlPuzzle: null,
  reset: vi.fn(),
  setGameId: vi.fn(),
  setIsMultiplayer: vi.fn(),
  setUrlPuzzle: vi.fn(),
  loadPuzzle: vi.fn(),
  setCompletionModalDismissed: vi.fn(),
};
vi.mock("../contexts/GameContext", () => ({
  STORAGE_KEY: "crossword-clash-solo",
  useGame: () => {
    const [displayName, setDisplayName] = useState("");
    return { ...gameStatic, displayName, setDisplayName };
  },
}));
vi.mock("../contexts/MultiplayerContext", () => ({ useMultiplayerContext: () => ({ shareCode: null, broadcastNewGame: vi.fn() }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" }, loading: false }) }));
let profile: { username: string } | null = null;
vi.mock("../contexts/AccountContext", () => ({
  useAccountContext: () => ({ profile }),
  useMaybeAccount: () => null,
}));
vi.mock("../lib/puzzleService", () => ({ uploadPuzzle: vi.fn(), createGame: vi.fn(), createNextGame: vi.fn() }));
vi.mock("../lib/sessionPersistence", () => ({ clearMpSession: vi.fn() }));

const nameField = () => screen.getByLabelText("Your name") as HTMLInputElement;

beforeEach(() => {
  profile = null;
});
afterEach(cleanup);

describe("HostNameScreen username prefill", () => {
  it("prefills the username when the profile arrives and nothing was typed", () => {
    const { rerender } = render(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    expect(nameField().value).toBe("");
    profile = { username: "Archer" };
    rerender(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    expect(nameField().value).toBe("Archer");
  });

  it("keeps a name the player had started typing when the profile arrives later", () => {
    const { rerender } = render(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    fireEvent.change(nameField(), { target: { value: "Arch" } });
    profile = { username: "Archer" };
    rerender(<MemoryRouter><HostNameScreen /></MemoryRouter>);
    expect(nameField().value).toBe("Arch");
  });
});
