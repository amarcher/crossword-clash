// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import type { FriendsContextValue } from "../../contexts/FriendsContext";
import { FriendsError, type Person } from "../../lib/friends";
import { track } from "../../lib/analytics";

const friends = vi.hoisted(() => ({ value: {} as FriendsContextValue }));
vi.mock("../../contexts/FriendsContext", () => ({ useFriends: () => friends.value }));
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
const profiles = vi.hoisted(() => ({ fetch: vi.fn(async (_ids: readonly string[]): Promise<Person[]> => []) }));
vi.mock("../../lib/friends", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/friends")>()),
  fetchPlayerProfiles: (ids: readonly string[]) => profiles.fetch(ids),
}));

const { RaceFriendSuggestions } = await import("./RaceFriendSuggestions");

// The room: the viewer, a friend already, someone anonymous (no profile) and two strangers.
const PLAYERS = [{ userId: "me" }, { userId: "alicia" }, { userId: "anon" }, { userId: "milo" }, { userId: "zed" }];
const ROOM_PROFILES: Person[] = [
  { userId: "me", username: "archer" },
  { userId: "alicia", username: "alicia" },
  { userId: "milo", username: "milo" },
  { userId: "zed", username: "zed" },
];

function value(over: Partial<FriendsContextValue> = {}): FriendsContextValue {
  return {
    active: true,
    ready: true,
    friendships: { friends: [{ userId: "alicia", username: "alicia", since: "2026-10-01T00:00:00Z" }], incoming: [], outgoing: [] },
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
    nudge: vi.fn(async () => {}),
    dismissRoomJoined: vi.fn(),
    ...over,
  };
}

beforeEach(() => {
  friends.value = value();
  profiles.fetch.mockReset().mockResolvedValue(ROOM_PROFILES);
  vi.mocked(track).mockClear();
});
afterEach(cleanup);

describe("RaceFriendSuggestions", () => {
  it("lists the room's other accounts that are not yet friends, never the viewer, a friend or an anonymous player", async () => {
    render(<RaceFriendSuggestions players={PLAYERS} viewerId="me" />);
    expect(await screen.findByText("@milo")).toBeTruthy();
    expect(screen.getByText("@zed")).toBeTruthy();
    expect(screen.queryByText("@archer")).toBeNull();
    expect(screen.queryByText("@alicia")).toBeNull();
    expect(screen.getByRole("heading", { name: "Raced with you" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add friend" })).toHaveLength(2);
    // One profiles read, for every id of the room (the lib drops the ones without a row).
    expect(profiles.fetch).toHaveBeenCalledTimes(1);
    expect(profiles.fetch).toHaveBeenCalledWith(["me", "alicia", "anon", "milo", "zed"]);
  });

  it("renders nothing with the switch off or for an anonymous viewer, before the profiles answer, and once nobody is left to add", async () => {
    friends.value = value({ active: false });
    const { container } = render(<RaceFriendSuggestions players={PLAYERS} viewerId="me" />);
    expect(container.innerHTML).toBe("");
    expect(profiles.fetch).not.toHaveBeenCalled();
    cleanup();

    friends.value = value();
    let answer: (list: Person[]) => void = () => {};
    profiles.fetch.mockReturnValue(new Promise<Person[]>((resolve) => (answer = resolve)));
    const pending = render(<RaceFriendSuggestions players={PLAYERS} viewerId="me" />);
    expect(pending.container.innerHTML).toBe("");
    answer([{ userId: "me", username: "archer" }, { userId: "alicia", username: "alicia" }]);
    await waitFor(() => expect(profiles.fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(pending.container.innerHTML).toBe("");
  });

  it("Add friend sends the request under the username, reports the post-race method and flips the row to Requested, keeping it after the refetch drops the person", async () => {
    render(<RaceFriendSuggestions players={PLAYERS} viewerId="me" />);
    await screen.findByText("@milo");
    fireEvent.click(screen.getAllByRole("button", { name: "Add friend" })[0]);
    await waitFor(() => expect(friends.value.request).toHaveBeenCalledWith("milo"));
    expect(await screen.findByText("Requested")).toBeTruthy();
    expect(track).toHaveBeenCalledWith("friend_request_sent", { method: "post-race", outcome: "pending" });
    // The context now lists milo as an outgoing request: the row stays, saying Requested, while zed keeps Add friend.
    friends.value = value({
      request: friends.value.request,
      friendships: { friends: [], incoming: [], outgoing: [{ userId: "milo", username: "milo", createdAt: "2026-11-02T00:00:00Z" }] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    await waitFor(() => expect(friends.value.request).toHaveBeenCalledWith("zed"));
    expect(screen.getByText("@milo")).toBeTruthy();
    expect(screen.getAllByText("Requested")).toHaveLength(2);
  });

  it("says Friends when the other side had asked first, and shows a refusal with the row still addable", async () => {
    friends.value = value({
      request: vi
        .fn<FriendsContextValue["request"]>()
        .mockResolvedValueOnce("accepted")
        .mockRejectedValueOnce(new FriendsError("rate_limited")),
    });
    render(<RaceFriendSuggestions players={PLAYERS} viewerId="me" />);
    await screen.findByText("@milo");
    fireEvent.click(screen.getAllByRole("button", { name: "Add friend" })[0]);
    expect(await screen.findByText("Friends")).toBeTruthy();
    expect(track).toHaveBeenCalledWith("friend_request_sent", { method: "post-race", outcome: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That's a lot of requests for one day. Try again tomorrow.");
    expect(screen.getByRole("button", { name: "Add friend" })).toBeTruthy();
  });
});
