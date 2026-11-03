// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import { ConfirmProvider } from "../ConfirmDialog";
import { FriendsError } from "../../lib/friends";
import type { FriendsContextValue } from "../../contexts/FriendsContext";

const friends = vi.hoisted(() => ({ value: {} as FriendsContextValue }));
vi.mock("../../contexts/FriendsContext", () => ({ useFriends: () => friends.value }));

const { PendingRequests } = await import("./PendingRequests");

function friendsValue(over: Partial<FriendsContextValue> = {}): FriendsContextValue {
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

const alicia = { userId: "a", username: "alicia", createdAt: "2026-11-02T00:00:00Z" };
const renderRows = (props: { showBlock?: boolean } = {}) =>
  render(
    <ConfirmProvider>
      <PendingRequests {...props} />
    </ConfirmProvider>,
  );

afterEach(cleanup);

describe("PendingRequests", () => {
  it("renders nothing without a request waiting", () => {
    friends.value = friendsValue();
    expect(renderRows().container.innerHTML).toBe("");
  });

  it("answers a request with Accept or Decline, and offers Block only when asked", async () => {
    const respond = vi.fn(async () => {});
    friends.value = friendsValue({ friendships: { friends: [], incoming: [alicia], outgoing: [] }, respond });
    renderRows();
    expect(screen.getByText("@alicia")).toBeTruthy();
    expect(screen.getByText("wants to be friends")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Block @alicia" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("a", true));
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("a", false));
  });

  it("blocks through the confirm dialog on the full screen, and shows a refusal", async () => {
    const block = vi.fn(async () => {});
    const respond = vi.fn(async () => {
      throw new FriendsError("rate_limited");
    });
    friends.value = friendsValue({ friendships: { friends: [], incoming: [alicia], outgoing: [] }, block, respond });
    renderRows({ showBlock: true });
    fireEvent.click(screen.getByRole("button", { name: "Block @alicia" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(dialog.querySelectorAll("button")[1]);
    await waitFor(() => expect(block).toHaveBeenCalledWith("a"));
    expect((await screen.findByRole("status")).textContent).toContain("@alicia is blocked");

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect((await screen.findByRole("alert")).textContent).toContain("a lot of requests");
  });
});
