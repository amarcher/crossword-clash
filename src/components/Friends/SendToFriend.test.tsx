// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import type { FriendsContextValue } from "../../contexts/FriendsContext";
import { FriendsError } from "../../lib/friends";

const friends = vi.hoisted(() => ({ value: {} as FriendsContextValue }));
vi.mock("../../contexts/FriendsContext", () => ({ useFriends: () => friends.value }));

const { SendToFriend } = await import("./SendToFriend");

const alicia = { userId: "a", username: "alicia", since: "2026-10-01T00:00:00Z" };
const link = "/daily/2026-10-31/mini?beat=102&by=Archer";

function value(over: Partial<FriendsContextValue> = {}): FriendsContextValue {
  return {
    active: true,
    ready: true,
    friendships: { friends: [alicia], incoming: [], outgoing: [] },
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
  friends.value = value();
});
afterEach(cleanup);

describe("SendToFriend", () => {
  it("renders nothing without friends or with the switch off", () => {
    friends.value = value({ friendships: { friends: [], incoming: [], outgoing: [] } });
    expect(render(<SendToFriend link={link} />).container.innerHTML).toBe("");
    cleanup();
    friends.value = value({ active: false });
    expect(render(<SendToFriend link={link} />).container.innerHTML).toBe("");
  });

  it("opens the friends list on tap and sends the daily link as a beat invite, flipping the row to Sent", async () => {
    render(<SendToFriend link={link} />);
    expect(screen.queryByText("@alicia")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Send to a friend" }));
    expect(screen.getByText("@alicia")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(friends.value.beat).toHaveBeenCalledWith("a", link));
    expect(await screen.findByText("Sent")).toBeTruthy();
  });

  it("shows a refusal and keeps the row sendable", async () => {
    friends.value = value({
      beat: vi.fn(async () => {
        throw new FriendsError("rate_limited");
      }),
    });
    render(<SendToFriend link={link} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to a friend" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "That's a lot of requests for one day. Try again tomorrow.");
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
  });
});
