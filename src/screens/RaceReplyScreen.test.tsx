// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import "../i18n/i18n";

const replies = vi.hoisted(() => ({ fetchRaceReply: vi.fn(), markRepliesSeen: vi.fn(async () => undefined) }));
vi.mock("../lib/raceReplies", () => replies);
const share = vi.hoisted(() => ({ fetchReplayShare: vi.fn(), letteredReplay: vi.fn() }));
vi.mock("../lib/replayShare", () => share);
const feed = vi.hoisted(() => ({ fetchDailyForDay: vi.fn() }));
vi.mock("../lib/dailyFeed", async (orig) => ({ ...(await orig<typeof import("../lib/dailyFeed")>()), fetchDailyForDay: feed.fetchDailyForDay }));
const community = vi.hoisted(() => ({ fetchCommunityPuzzle: vi.fn() }));
vi.mock("../lib/communityPuzzles", async (orig) => ({ ...(await orig<typeof import("../lib/communityPuzzles")>()), fetchCommunityPuzzle: community.fetchCommunityPuzzle }));

const { RaceReplyScreen } = await import("./RaceReplyScreen");

const ID = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
const renderAt = () =>
  render(
    <MemoryRouter initialEntries={[`/reply/${ID}`]}>
      <Routes>
        <Route path="/reply/:id" element={<RaceReplyScreen />} />
      </Routes>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  share.fetchReplayShare.mockReset();
  share.letteredReplay.mockReset();
});

describe("RaceReplyScreen", () => {
  it("says who raced which daily and how it went, offers their solve and a race back, and marks the reply seen", async () => {
    replies.fetchRaceReply.mockResolvedValueOnce({ id: ID, shareId: "E0Gqr8Iw09i", name: "Sam", ref: { day: "2026-11-12", slot: "mini" }, title: null, seconds: 90, toSeconds: 102, replyShareId: "VJ0ncnWyJ9j", createdAt: "", seen: false });
    feed.fetchDailyForDay.mockResolvedValueOnce({ puzzle: { width: 5, height: 5, cells: [] } });
    share.fetchReplayShare.mockResolvedValueOnce("CODE");
    share.letteredReplay.mockReturnValueOnce({ seconds: 90, events: [[0, 0, "A"]] });
    renderAt();
    expect(await screen.findByRole("heading", { name: "Sam raced your Daily Mini" })).toBeTruthy();
    expect(screen.getByText(/Sam won by 0:12/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Watch Sam's solve" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Race Sam's solve" }).getAttribute("href")).toBe("/daily/2026-11-12/mini?beat=90&by=Sam&r=VJ0ncnWyJ9j");
    expect(replies.markRepliesSeen).toHaveBeenCalledWith([ID]);
  });

  it("plays the race side by side when the viewer's own shared solve loads too", async () => {
    replies.fetchRaceReply.mockResolvedValueOnce({ id: ID, shareId: "E0Gqr8Iw09i", name: "Sam", ref: { day: "2026-11-12", slot: "mini" }, title: null, seconds: 90, toSeconds: 102, replyShareId: "VJ0ncnWyJ9j", createdAt: "", seen: false });
    feed.fetchDailyForDay.mockResolvedValueOnce({ puzzle: { width: 1, height: 1, cells: [[{ row: 0, col: 0, solution: "A", number: 1 }]], clues: [] } });
    share.fetchReplayShare.mockImplementation(async (id: string) => (id === "VJ0ncnWyJ9j" ? "THEIRS" : "MINE"));
    share.letteredReplay.mockImplementation((code: string) => ({ seconds: code === "THEIRS" ? 90 : 102, events: [[0, 0, "A"]] }));
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Watch the race" }));
    expect(await screen.findByRole("dialog", { name: "You vs Sam" })).toBeTruthy();
    expect(screen.getByText("Sam won by 0:12 · played at 6× speed")).toBeTruthy();
    expect(screen.getAllByRole("figure").map((f) => f.getAttribute("aria-label"))).toEqual(["You", "Sam"]);
  });

  it("names a community puzzle by title and races back on its page", async () => {
    replies.fetchRaceReply.mockResolvedValueOnce({ id: ID, shareId: "E0Gqr8Iw09i", name: "Sam", ref: { shortId: "abcdefgh" }, title: "Farm", seconds: 120, toSeconds: 102, replyShareId: "VJ0ncnWyJ9j", createdAt: "", seen: false });
    community.fetchCommunityPuzzle.mockResolvedValueOnce(null);
    share.fetchReplayShare.mockResolvedValue(null);
    renderAt();
    expect(await screen.findByRole("heading", { name: "Sam raced your “Farm”" })).toBeTruthy();
    expect(screen.getByText("You won by 0:18")).toBeTruthy();
    expect(community.fetchCommunityPuzzle).toHaveBeenCalledWith("abcdefgh");
    expect(screen.getByRole("link", { name: "Race Sam's solve" }).getAttribute("href")).toBe("/puzzles/abcdefgh?beat=120&by=Sam&r=VJ0ncnWyJ9j");
  });

  it("says so when the reply isn't there", async () => {
    replies.fetchRaceReply.mockResolvedValueOnce(null);
    renderAt();
    expect(await screen.findByText("This race isn't here anymore")).toBeTruthy();
  });
});
