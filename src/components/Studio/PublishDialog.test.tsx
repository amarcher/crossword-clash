// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import { gridFromRows, slotsOf } from "../../lib/seedgrid/grid";
import { initialStudioState, slotKey, type StudioState } from "../../lib/seedgrid/studioState";
import { PUBLISHING_TERMS_VERSION } from "../../lib/community";
import type { CommunityPuzzle, PublisherRow } from "../../lib/communityPuzzles";

const account = vi.hoisted(() => ({ fetchProfile: vi.fn(), accountName: () => "Ada Lovelace" }));
vi.mock("../../lib/account", () => account);
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("../../lib/dailyIndex", () => ({ knownPublishedIndex: () => null, prefetchDailyIndex: () => Promise.resolve() }));
// The picker's own dependencies, so the no-username path renders.
vi.mock("../../lib/playerName", () => ({ savePlayerName: vi.fn() }));
const community = vi.hoisted(() => ({
  acceptPublishingTerms: vi.fn(),
  fetchPublisher: vi.fn(),
  publishPuzzle: vi.fn(),
  unpublishPuzzle: vi.fn(),
}));
vi.mock("../../lib/communityPuzzles", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/communityPuzzles")>()), ...community }));

const { PublishDialog } = await import("./PublishDialog");
const { CommunityError } = await import("../../lib/communityPuzzles");

function studio(overrides: Partial<StudioState> = {}): StudioState {
  const grid = gridFromRows(["CAT", "ORE", "WED"]);
  const clues: Record<string, string> = {};
  const text: Record<string, string> = { "1A": "Tabby", "4A": "Mined rock", "5A": "Tied the knot", "1D": "Dairy animal", "2D": "Exist", "3D": "Talk series" };
  for (const s of slotsOf(grid)) clues[slotKey(s)] = text[s.id];
  return { ...initialStudioState(3, "p-1"), grid, clues, title: "Farm", ...overrides };
}

const user = { id: "u1", is_anonymous: false } as unknown as import("@supabase/supabase-js").User;
const publisher: PublisherRow = { user_id: "u1", terms_accepted_at: "2026-10-28T00:00:00Z", terms_version: PUBLISHING_TERMS_VERSION, strikes: 0, banned_at: null, ban_reason: null, created_at: "2026-10-28T00:00:00Z" };
const existing: CommunityPuzzle = {
  id: "row-1", short_id: "abcdefgh", author_id: "u1", author: "ada", studio_id: "p-1", version: 1, status: "published", title: "Farm", notes: "A tiny one.", difficulty: "medium", lang: "en",
  width: 3, height: 3, clue_count: 6, puzzle_key: "k", plays: 4, solves: 2, published_at: "2026-10-28T00:00:00Z", updated_at: "2026-10-28T00:00:00Z", removed_reason: null,
};

const props = () => ({ state: studio(), dispatch: vi.fn(), user, existing: null, onClose: vi.fn(), onChanged: vi.fn() });

beforeEach(() => {
  account.fetchProfile.mockResolvedValue({ user_id: "u1", username: "ada", display_name: null });
  community.fetchPublisher.mockResolvedValue(publisher);
  community.publishPuzzle.mockReset();
  community.acceptPublishingTerms.mockReset().mockResolvedValue(undefined);
  community.unpublishPuzzle.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("PublishDialog", () => {
  it("asks an anonymous visitor to sign in", () => {
    render(<PublishDialog {...props()} user={null} />);
    expect(screen.getByText(/Sign in from the top bar/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Publish$/ })).toBeNull();
  });

  it("opens the username picker when the account has none", async () => {
    account.fetchProfile.mockResolvedValue(null);
    render(<PublishDialog {...props()} />);
    expect(await screen.findByLabelText("Username")).toBeTruthy();
  });

  it("needs the terms once, then publishes the snapshot under the username and shows the link", async () => {
    community.fetchPublisher.mockResolvedValue(null);
    community.publishPuzzle.mockResolvedValue({ id: "row-1", shortId: "abcdefgh", version: 1 });
    const p = props();
    render(<PublishDialog {...p} />);
    const publish = (await screen.findByRole("button", { name: /^Publish$/ })) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(publish.disabled).toBe(false);
    fireEvent.click(publish);
    await screen.findByText(/Your puzzle is live/);
    expect(community.acceptPublishingTerms).toHaveBeenCalledWith(PUBLISHING_TERMS_VERSION);
    const input = community.publishPuzzle.mock.calls[0][0];
    expect(input).toMatchObject({ studioId: "p-1", title: "Farm", difficulty: "medium", lang: "en" });
    expect(input.snapshot.author).toBe("ada");
    expect(screen.getByText(/\/puzzles\/abcdefgh$/)).toBeTruthy();
    expect(p.onChanged).toHaveBeenCalled();
  });

  it("lists what is wrong and keeps Publish disabled", async () => {
    const state = studio({ title: "" });
    render(<PublishDialog {...props()} state={state} />);
    const publish = (await screen.findByRole("button", { name: /^Publish$/ })) as HTMLButtonElement;
    expect(screen.getByText("Give it a title.")).toBeTruthy();
    expect(publish.disabled).toBe(true);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("offers Update, Copy link and a confirmed Unpublish for a published puzzle", async () => {
    const p = props();
    render(<PublishDialog {...p} existing={existing} />);
    expect(await screen.findByRole("button", { name: /^Update$/ })).toBeTruthy();
    expect((screen.getByLabelText(/Note for solvers/) as HTMLTextAreaElement).value).toBe("A tiny one.");
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(community.unpublishPuzzle).toHaveBeenCalledWith("row-1"));
    expect(p.onChanged).toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalled();
  });

  it("shows a refusal by kind", async () => {
    community.publishPuzzle.mockRejectedValue(new CommunityError("already_published"));
    render(<PublishDialog {...props()} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Publish$/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("Someone has already published this exact puzzle.");
  });

  it("tells a stopped author so", async () => {
    community.fetchPublisher.mockResolvedValue({ ...publisher, banned_at: "2026-10-28T00:00:00Z" });
    render(<PublishDialog {...props()} />);
    expect(await screen.findByText(/Publishing is switched off/)).toBeTruthy();
  });
});
