// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import type { FriendsContextValue } from "../../contexts/FriendsContext";
import { FriendsError, setPendingChallenge } from "../../lib/friends";

const friends = vi.hoisted(() => ({ value: {} as FriendsContextValue }));
vi.mock("../../contexts/FriendsContext", () => ({ useFriends: () => friends.value }));

const { LobbyInvites } = await import("./LobbyInvites");

const alicia = { userId: "a", username: "alicia", since: "2026-10-01T00:00:00Z" };
const milo = { userId: "m", username: "milo", since: "2026-10-02T00:00:00Z" };

function value(over: Partial<FriendsContextValue> = {}): FriendsContextValue {
  return {
    active: true,
    ready: true,
    friendships: { friends: [alicia, milo], incoming: [], outgoing: [] },
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

beforeEach(() => {
  sessionStorage.clear();
  friends.value = value();
});
afterEach(cleanup);

describe("LobbyInvites", () => {
  it("renders nothing for a viewer with no friends or with the switch off", () => {
    friends.value = value({ friendships: { friends: [], incoming: [], outgoing: [] } });
    const { container } = render(<LobbyInvites gameId="g1" />);
    expect(container.innerHTML).toBe("");
    friends.value = value({ active: false });
    const second = render(<LobbyInvites gameId="g1" />);
    expect(second.container.innerHTML).toBe("");
  });

  it("lists the friends with Invite, and a tap writes the invite for this room and flips the row to Invited", async () => {
    render(<LobbyInvites gameId="g1" />);
    expect(screen.getByText("@alicia")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Invite" })[0]);
    await waitFor(() => expect(friends.value.invite).toHaveBeenCalledWith("g1", "a"));
    expect(await screen.findByText("Invited")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Invite" })).toHaveLength(1);
  });

  it("treats 'already invited' as done and shows other refusals", async () => {
    friends.value = value({
      invite: vi.fn(async (_g: string, id: string) => {
        throw new FriendsError(id === "a" ? "already_invited" : "rate_limited");
      }),
    });
    render(<LobbyInvites gameId="g1" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Invite" })[0]);
    expect(await screen.findByText("Invited")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That's a lot of requests for one day. Try again tomorrow.");
  });

  it("invites the friend that Challenge was tapped for as soon as the room exists, once", async () => {
    setPendingChallenge("m");
    render(<LobbyInvites gameId="g1" />);
    await waitFor(() => expect(friends.value.invite).toHaveBeenCalledWith("g1", "m"));
    expect(friends.value.invite).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("crossword-clash:pending-challenge")).toBeNull();
    expect(await screen.findByText("Invited")).toBeTruthy();
  });
});
