// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import type { FriendsContextValue } from "../contexts/FriendsContext";
import type { RoomInvite } from "../lib/friends";

const navigate = vi.fn();
vi.mock("../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
vi.mock("../lib/analytics", () => ({ track: vi.fn() }));
const game = { urlPuzzle: null as { title: string } | null, setUrlPuzzle: vi.fn() };
vi.mock("../contexts/GameContext", () => ({ useGame: () => game }));
const account = { user: null as { id: string } | null, profile: null as { username: string } | null, available: true, openAccount: vi.fn() };
vi.mock("../contexts/AccountContext", () => ({ useAccountContext: () => account, useMaybeAccount: () => null }));
const friends = vi.hoisted(() => ({ value: {} as FriendsContextValue }));
vi.mock("../contexts/FriendsContext", () => ({ useFriends: () => friends.value }));

const { RaceScreen } = await import("./RaceScreen");

function friendsValue(over: Partial<FriendsContextValue> = {}): FriendsContextValue {
  return {
    active: true,
    ready: true,
    friendships: { friends: [], incoming: [], outgoing: [] },
    invites: [],
    openInvites: [],
    unseenInvites: [],
    blocked: [],
    refresh: vi.fn(async () => {}),
    request: vi.fn(async () => "pending" as const),
    respond: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    block: vi.fn(async () => {}),
    unblock: vi.fn(async () => {}),
    invite: vi.fn(async () => {}),
    beat: vi.fn(async () => {}),
    markSeen: vi.fn(async () => {}),
    ...over,
  };
}

const alicia = { userId: "a", username: "alicia", since: "2026-10-01T00:00:00Z" };
const invite: RoomInvite = {
  id: "i1",
  kind: "room",
  from: { userId: "a", username: "alicia" },
  createdAt: new Date().toISOString(),
  seenAt: null,
  room: { gameId: "g1", code: "KQ7MXB", status: "waiting", title: "Birds of a feather", width: 15, height: 15 },
  link: null,
};

/** The screen's block headings in page order. */
const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

beforeEach(() => {
  navigate.mockClear();
  sessionStorage.clear();
  game.urlPuzzle = null;
  account.user = { id: "me" };
  account.profile = { username: "me" };
  account.openAccount.mockClear();
  friends.value = friendsValue();
});
afterEach(cleanup);

const renderScreen = () =>
  render(
    <MemoryRouter initialEntries={["/race"]}>
      <RaceScreen />
    </MemoryRouter>,
  );

describe("RaceScreen (/race, spec §3.6)", () => {
  it("shows a signed-out visitor the code first, then Start a room and a quiet sign-in row, nothing about friends", () => {
    account.user = null;
    account.profile = null;
    friends.value = friendsValue({ active: false });
    renderScreen();
    expect(headings()).toEqual(["Join with a code", "Start a room", "Sign in to keep a friends list"]);
    expect(screen.queryByText("Friends")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(account.openAccount).toHaveBeenCalledWith({ placement: "race", returnTo: "/race" });
  });

  it("asks a signed-in account without a username to choose one", () => {
    account.profile = null;
    friends.value = friendsValue({ active: false });
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Choose a username" }));
    expect(account.openAccount).toHaveBeenCalledWith({ view: "username", placement: "race" });
  });

  it("shows an account with no friends the code first and an Add friends card that opens the friends list", () => {
    renderScreen();
    expect(headings()).toEqual(["Join with a code", "Start a room", "Add friends to race them in a tap"]);
    fireEvent.click(screen.getByRole("button", { name: "Add friends" }));
    expect(navigate).toHaveBeenCalledWith("/race/friends");
  });

  it("puts friends first once there are some; Challenge remembers the friend and starts the host flow through the picker", () => {
    friends.value = friendsValue({ friendships: { friends: [alicia], incoming: [], outgoing: [] } });
    renderScreen();
    expect(headings()).toEqual(["Friends", "Start a room", "Join with a code"]);
    expect(screen.getByText("@alicia")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Challenge" }));
    expect(sessionStorage.getItem("crossword-clash:pending-challenge")).toBe("a");
    expect(navigate).toHaveBeenCalledWith("/pick-puzzle?intent=race");
  });

  it("with the daily tile's puzzle as the chip, Challenge and Start go straight to the host name screen", () => {
    game.urlPuzzle = { title: "Shapes and shadows" };
    friends.value = friendsValue({ friendships: { friends: [alicia], incoming: [], outgoing: [] } });
    renderScreen();
    expect(screen.getByText("Racing: Shapes and shadows")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    expect(navigate).toHaveBeenLastCalledWith("/host-game/name");
    expect(sessionStorage.getItem("crossword-clash:pending-challenge")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    expect(game.setUrlPuzzle).toHaveBeenCalledWith(null);
  });

  it("puts invites from friends first; Join marks the invite seen and lands on the join screen with the code", () => {
    friends.value = friendsValue({ friendships: { friends: [alicia], incoming: [], outgoing: [] }, openInvites: [invite], invites: [invite] });
    renderScreen();
    expect(headings()).toEqual(["From your friends", "Friends", "Start a room", "Join with a code"]);
    expect(screen.getByText("Opened a room · Birds of a feather · 15×15")).toBeTruthy();
    // The invites block's Join comes before the code card's.
    fireEvent.click(screen.getAllByRole("button", { name: "Join" })[0]);
    expect(friends.value.markSeen).toHaveBeenCalledWith(["i1"]);
    expect(navigate).toHaveBeenCalledWith("/join?join=KQ7MXB");
  });

  it("takes a typed code to the join screen, and not before six characters", () => {
    renderScreen();
    const field = screen.getByLabelText("Game Code");
    const joinButton = () => screen.getByRole("button", { name: "Join" });
    expect(joinButton()).toHaveProperty("disabled", true);
    fireEvent.change(field, { target: { value: "kq7m" } });
    expect(joinButton()).toHaveProperty("disabled", true);
    fireEvent.change(field, { target: { value: "https://crosswordclash.com/?join=KQ7MXB" } });
    expect(joinButton()).toHaveProperty("disabled", false);
    fireEvent.submit(field.closest("form")!);
    expect(navigate).toHaveBeenCalledWith("/join?join=KQ7MXB");
  });
});
