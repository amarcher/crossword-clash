// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n/i18n";

const track = vi.fn();
vi.mock("../../lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));
vi.mock("../../lib/supabaseClient", () => ({ supabase: null }));
// The runtime's share mechanism, scripted per test.
const share = vi.hoisted(() => ({ deps: {} as Record<string, unknown> }));
vi.mock("../CompletionModal/ShareResultButton", () => ({ runtimeDeps: async () => share.deps }));

import { InviteFriendCard } from "./InviteFriendCard";

const LINK = `${window.location.origin}/add/archer`;

beforeEach(() => {
  track.mockClear();
});
afterEach(cleanup);

describe("InviteFriendCard", () => {
  it("sends the viewer's own link through the share sheet, with the words around it", async () => {
    const webShare = vi.fn(async () => {});
    share.deps = { nativePlatform: false, canWebShare: true, canCopy: true, webShare, copy: vi.fn() };
    render(<InviteFriendCard username="archer" />);
    fireEvent.click(screen.getByRole("button", { name: "Share my link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Link sent"));
    expect(webShare).toHaveBeenCalledWith({ text: `Add me on Crossword Clash: ${LINK}`, title: "Crossword Clash" });
    expect(track).toHaveBeenCalledWith("friend_link_shared", { method: "webshare", outcome: "shared", placement: "friends" });
  });

  it("copies the link where there is no share sheet, and says nothing for a dismissed one", async () => {
    const copy = vi.fn(async () => {});
    share.deps = { nativePlatform: false, canWebShare: false, canCopy: true, copy };
    render(<InviteFriendCard username="archer" />);
    fireEvent.click(screen.getByRole("button", { name: "Share my link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Link copied"));
    expect(copy).toHaveBeenCalledWith(`Add me on Crossword Clash: ${LINK}`);

    cleanup();
    track.mockClear();
    const dismissed = vi.fn(async () => {
      throw Object.assign(new Error("dismissed"), { name: "AbortError" });
    });
    share.deps = { nativePlatform: false, canWebShare: true, canCopy: true, webShare: dismissed, copy };
    render(<InviteFriendCard username="archer" />);
    fireEvent.click(screen.getByRole("button", { name: "Share my link" }));
    await waitFor(() => expect(dismissed).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("button", { name: "Share my link" })).toHaveProperty("disabled", false));
    expect(screen.queryByRole("status")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it("shows the same link as a QR code on request, and hides it again", () => {
    render(<InviteFriendCard username="archer" />);
    expect(screen.queryByTitle("QR code of your friend link")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show QR code" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByTitle("QR code of your friend link")).toBeTruthy();
    expect(screen.getByText(LINK.replace(/^https?:\/\//, ""))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide QR code" }));
    expect(screen.queryByTitle("QR code of your friend link")).toBeNull();
  });
});
