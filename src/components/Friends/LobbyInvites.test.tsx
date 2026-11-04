// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import type { FriendsContextValue } from "../../contexts/FriendsContext";
import { FriendsError, setPendingChallenge } from "../../lib/friends";

const friends = vi.hoisted(() => ({ value: {} as FriendsContextValue }));
vi.mock("../../contexts/FriendsContext", () => ({ useFriends: () => friends.value }));
const solves = vi.hoisted(() => ({ byKey: {} as Record<string, Record<string, { mode: string; day: string }>>, asked: [] as (string | null | undefined)[] }));
vi.mock("../../hooks/useFriendSolves", () => ({
  useFriendSolves: (key: string | null | undefined) => {
    solves.asked.push(key);
    return (key && solves.byKey[key]) || {};
  },
}));

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
    sentInvites: [],
    roomJoined: null,
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
    decline: vi.fn(async () => {}),
    nudge: vi.fn(async () => 60),
    dismissRoomJoined: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  sessionStorage.clear();
  friends.value = value();
  solves.byKey = {};
  solves.asked = [];
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

  it("marks a friend who already finished this room's puzzle, Solved on their own or Raced it in a room, and still offers Invite (spec §3.8)", () => {
    solves.byKey["civics|9x9|k"] = { a: { mode: "solo", day: "2026-11-03" }, m: { mode: "versus", day: "2026-11-02" } };
    render(<LobbyInvites gameId="g1" puzzleKey="civics|9x9|k" />);
    expect(solves.asked).toContain("civics|9x9|k");
    expect(screen.getByText("Solved")).toBeTruthy();
    expect(screen.getByText("Raced it")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Invite" })).toHaveLength(2);
    cleanup();
    // Nothing on record: no chip, and no puzzle means nothing is asked.
    render(<LobbyInvites gameId="g1" />);
    expect(screen.queryByText("Solved")).toBeNull();
    expect(screen.queryByText("Raced it")).toBeNull();
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

  it("says where each friend stands: Invited from the sender's own rows, Joined once they are in the roster, Can't right now when declined", () => {
    friends.value = value({
      sentInvites: [
        { id: "i1", gameId: "g1", toUserId: "a", createdAt: "2026-11-02T00:00:00Z", response: null },
        { id: "i2", gameId: "g1", toUserId: "m", createdAt: "2026-11-02T00:00:00Z", response: "declined" },
      ],
    });
    const { rerender } = render(<LobbyInvites gameId="g1" players={[{ userId: "host" }]} />);
    expect(screen.getByText("Invited")).toBeTruthy();
    expect(screen.getByText("Can't right now")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    // alicia arrives: her row says Joined whatever the invite row says; a declined friend who turns up anyway is Joined too.
    rerender(<LobbyInvites gameId="g1" players={[{ userId: "host" }, { userId: "a" }, { userId: "m" }]} />);
    expect(screen.getAllByText("Joined")).toHaveLength(2);
    expect(screen.queryByText("Can't right now")).toBeNull();
    // Rows from another room do not count here.
    friends.value = value({ sentInvites: [{ id: "i3", gameId: "other", toUserId: "a", createdAt: "x", response: null }] });
    rerender(<LobbyInvites gameId="g1" players={[]} />);
    expect(screen.getAllByRole("button", { name: "Invite" })).toHaveLength(2);
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
