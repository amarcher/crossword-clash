// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import "../i18n/i18n";

const replies = vi.hoisted(() => ({ fetchRaceReply: vi.fn(), markRepliesSeen: vi.fn(async () => undefined) }));
vi.mock("../lib/raceReplies", () => replies);
const share = vi.hoisted(() => ({ fetchReplayShare: vi.fn(), letteredReplay: vi.fn() }));
vi.mock("../lib/replayShare", () => share);
const feed = vi.hoisted(() => ({ fetchDailyForDay: vi.fn() }));
vi.mock("../lib/dailyFeed", async (orig) => ({ ...(await orig<typeof import("../lib/dailyFeed")>()), fetchDailyForDay: feed.fetchDailyForDay }));

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
});

describe("RaceReplyScreen", () => {
  it("says who raced which daily and how it went, offers their solve and a race back, and marks the reply seen", async () => {
    replies.fetchRaceReply.mockResolvedValueOnce({ id: ID, name: "Sam", day: "2026-11-12", slot: "mini", seconds: 90, toSeconds: 102, replyShareId: "VJ0ncnWyJ9j", createdAt: "", seen: false });
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

  it("says so when the reply isn't there", async () => {
    replies.fetchRaceReply.mockResolvedValueOnce(null);
    renderAt();
    expect(await screen.findByText("This race isn't here anymore")).toBeTruthy();
  });
});
