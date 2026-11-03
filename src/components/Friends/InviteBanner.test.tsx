// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../../i18n/i18n";
import type { FriendsContextValue } from "../../contexts/FriendsContext";
import type { RoomInvite } from "../../lib/friends";

const navigate = vi.fn();
vi.mock("../../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
const track = vi.fn();
vi.mock("../../lib/analytics", () => ({ track: (...args: unknown[]) => track(...args) }));
const friends = vi.hoisted(() => ({ value: {} as FriendsContextValue }));
vi.mock("../../contexts/FriendsContext", () => ({ useFriends: () => friends.value }));

const { InviteBanner } = await import("./InviteBanner");

const invite: RoomInvite = {
  id: "i1",
  kind: "room",
  from: { userId: "a", username: "alicia" },
  createdAt: new Date().toISOString(),
  seenAt: null,
  room: { gameId: "g1", code: "KQ7MXB", status: "waiting", title: "Birds of a feather", width: 15, height: 15 },
  link: null,
  response: null,
};

function value(over: Partial<FriendsContextValue> = {}): FriendsContextValue {
  return {
    active: true,
    ready: true,
    friendships: { friends: [], incoming: [], outgoing: [] },
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

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <InviteBanner />
    </MemoryRouter>,
  );

beforeEach(() => {
  navigate.mockClear();
  track.mockClear();
  friends.value = value();
});
afterEach(cleanup);

describe("InviteBanner", () => {
  it("shows the newest unseen room invite with Can't now beside Join; Can't now declines it from the banner", () => {
    friends.value = value({ unseenInvites: [invite] });
    at("/menu");
    expect(screen.getByRole("status").textContent).toContain("@alicia invited you to race");
    fireEvent.click(screen.getByRole("button", { name: "Can't now" }));
    expect(friends.value.decline).toHaveBeenCalledWith(invite, "banner");
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    expect(friends.value.markSeen).toHaveBeenCalledWith(["i1"]);
    expect(navigate).toHaveBeenCalledWith("/join?join=KQ7MXB");
  });

  it("a beat challenge has no Can't now (there is nothing to decline)", () => {
    friends.value = value({ unseenInvites: [{ ...invite, kind: "beat", room: null, link: "/daily/2026-10-20/mini?beat=102" }] });
    at("/menu");
    expect(screen.getByRole("button", { name: "Beat it" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Can't now" })).toBeNull();
  });

  it("tells a host elsewhere in the app who joined, with Go to room landing on that lobby, and reports the notice once", () => {
    friends.value = value({ roomJoined: { gameId: "g1", code: "KQ7MXB", title: "Birds of a feather", joinerName: "alicia", at: 1 } });
    at("/menu");
    expect(screen.getByRole("status").textContent).toContain("@alicia joined your room");
    expect(screen.getByRole("status").textContent).toContain("Birds of a feather");
    expect(track).toHaveBeenCalledWith("room_joined_notified", { via: "banner" });
    expect(track).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Go to room" }));
    expect(friends.value.dismissRoomJoined).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith("/lobby/g1");
  });

  it("names an anonymous joiner 'A player', wins over an invite, and the dismiss control clears it", () => {
    friends.value = value({ unseenInvites: [invite], roomJoined: { gameId: "g1", code: "KQ7MXB", title: "", joinerName: null, at: 1 } });
    at("/account");
    expect(screen.getByRole("status").textContent).toContain("A player joined your room");
    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(friends.value.dismissRoomJoined).toHaveBeenCalledOnce();
  });

  it("stays quiet on that room's lobby, on any lobby and in a game, and reports nothing there", () => {
    friends.value = value({ unseenInvites: [invite], roomJoined: { gameId: "g1", code: "KQ7MXB", title: "", joinerName: "alicia", at: 1 } });
    for (const path of ["/lobby/g1", "/lobby/other", "/play/g1", "/host"]) {
      const { container, unmount } = at(path);
      expect(container.innerHTML).toBe("");
      unmount();
    }
    expect(track).not.toHaveBeenCalled();
  });
});
