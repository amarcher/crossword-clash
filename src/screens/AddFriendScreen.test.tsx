// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router";
import "../i18n/i18n";

/** The page a player's "add me" link opens, over a mocked account, friends list and profile lookup. */
const navigate = vi.fn();
vi.mock("react-router", async () => ({ ...(await vi.importActual<typeof import("react-router")>("react-router")), useNavigate: () => navigate }));
vi.mock("../lib/supabaseClient", () => ({ supabase: {} }));
const track = vi.fn();
vi.mock("../lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

const account = { user: null as { id: string } | null, profile: null as { username: string } | null, available: true, openAccount: vi.fn() };
vi.mock("../contexts/AccountContext", () => ({ useAccountContext: () => account, useMaybeAccount: () => null }));

type Person = { userId: string; username: string };
const friendsState = {
  active: false,
  friendships: { friends: [] as Person[], incoming: [] as Person[], outgoing: [] as Person[] },
  request: vi.fn<(username: string) => Promise<"pending" | "accepted">>(),
  respond: vi.fn<(id: string, accept: boolean) => Promise<void>>(),
};
vi.mock("../contexts/FriendsContext", () => ({ useFriends: () => friendsState }));

const lookup = vi.fn<(username: string) => Promise<Person | null>>();
vi.mock("../lib/friends", async (original) => {
  const actual = await original<typeof import("../lib/friends")>();
  return { ...actual, fetchProfileByUsername: (u: string) => lookup(u) };
});

import { AddFriendScreen } from "./AddFriendScreen";
import { FriendsError } from "../lib/friends";

const ALICIA = { userId: "a", username: "alicia" };
function open(path = "/add/alicia") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/add/:username" element={<AddFriendScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}
const signedIn = () => {
  account.user = { id: "me" };
  account.profile = { username: "archer" };
  friendsState.active = true;
};

beforeEach(() => {
  account.user = null;
  account.profile = null;
  account.openAccount.mockClear();
  friendsState.active = false;
  friendsState.friendships = { friends: [], incoming: [], outgoing: [] };
  friendsState.request.mockReset().mockResolvedValue("pending");
  friendsState.respond.mockReset().mockResolvedValue();
  lookup.mockReset().mockResolvedValue(ALICIA);
  navigate.mockClear();
  track.mockClear();
});
afterEach(cleanup);

describe("AddFriendScreen (/add/:username)", () => {
  it("a signed-in player sees who is asking and sends the request with one tap", async () => {
    signedIn();
    open();
    expect(await screen.findByRole("heading", { name: "Add @alicia as a friend?" })).toBeTruthy();
    expect(lookup).toHaveBeenCalledWith("alicia");
    // Opening the page asks nothing of the server on the viewer's behalf.
    expect(friendsState.request).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Request sent. @alicia will see it"));
    expect(friendsState.request).toHaveBeenCalledWith("alicia");
    expect(track).toHaveBeenCalledWith("friend_request_sent", { method: "link", outcome: "pending" });
    fireEvent.click(screen.getByRole("button", { name: "See your friends" }));
    expect(navigate).toHaveBeenCalledWith("/race/friends");
  });

  it("when the link's owner had already asked, the tap accepts and the two are friends", async () => {
    signedIn();
    friendsState.friendships.incoming = [ALICIA];
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Accept their request" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("You and @alicia are friends."));
    expect(friendsState.respond).toHaveBeenCalledWith("a", true);
    expect(friendsState.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Race friends" }));
    expect(navigate).toHaveBeenCalledWith("/race");
  });

  it("says where things already stand: friends, a request already sent, the viewer's own link", async () => {
    signedIn();
    friendsState.friendships.friends = [ALICIA];
    open();
    expect(await screen.findByText("You and @alicia are friends.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add friend" })).toBeNull();

    cleanup();
    friendsState.friendships = { friends: [], incoming: [], outgoing: [ALICIA] };
    open();
    expect(await screen.findByText(/^Request sent\. @alicia will see it/)).toBeTruthy();

    cleanup();
    friendsState.friendships = { friends: [], incoming: [], outgoing: [] };
    lookup.mockResolvedValue({ userId: "me", username: "archer" });
    open("/add/archer");
    expect(await screen.findByText(/This is your own link/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add friend" })).toBeNull();
  });

  it("a visitor without an account is asked to sign in and comes back to the link", async () => {
    open();
    expect(await screen.findByRole("heading", { name: "Sign in to add @alicia" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(account.openAccount).toHaveBeenCalledWith({ placement: "friend-link", returnTo: "/add/alicia" });
    expect(friendsState.request).not.toHaveBeenCalled();

    // Signed in, no username yet: the username step, then this same page.
    cleanup();
    account.user = { id: "me" };
    open();
    expect(await screen.findByText(/Pick a username first, so @alicia knows who is asking/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Choose a username" }));
    expect(account.openAccount).toHaveBeenLastCalledWith({ view: "username", placement: "friend-link" });
  });

  it("an unknown player, a malformed link and a refused request each say so", async () => {
    lookup.mockResolvedValue(null);
    open("/add/nobody_here");
    expect(await screen.findByText("No player is called @nobody_here.")).toBeTruthy();

    cleanup();
    lookup.mockClear();
    open("/add/a%20b");
    expect(await screen.findByText("This link doesn't name a player.")).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();

    cleanup();
    signedIn();
    lookup.mockResolvedValue(ALICIA);
    friendsState.request.mockRejectedValue(new FriendsError("cooldown", "friends:cooldown"));
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Add friend" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add friend" })).toHaveProperty("disabled", false);
  });
});
