// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { CompletionModal } from "./CompletionModal";
import type { PlayerResult } from "./CompletionModal";
import { track } from "../../lib/analytics";
import type { NextUpItem } from "../../lib/nextUp";
import type { Puzzle } from "../../types/puzzle";
import { buildPuzzle } from "../../lib/samplePuzzles";

vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
// The friends context is inert (as outside its provider) unless a test switches it on.
const friends = vi.hoisted(() => ({ active: false }));
vi.mock("../../contexts/FriendsContext", () => ({
  useFriends: () => ({
    active: friends.active,
    ready: true,
    friendships: { friends: [], incoming: [], outgoing: [] },
    invites: [],
    openInvites: [],
    unseenInvites: [],
    blocked: [],
    refresh: async () => {},
    request: async () => "pending",
    respond: async () => {},
    remove: async () => {},
    block: async () => {},
    unblock: async () => {},
    invite: async () => {},
    beat: async () => {},
    markSeen: async () => {},
  }),
}));
vi.mock("../../lib/friends", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/friends")>()),
  fetchPlayerProfiles: async (ids: readonly string[]) => ids.map((id) => ({ userId: id, username: id })),
}));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
  friends.active = false;
});

const SOLO_PROPS = {
  open: true,
  totalCells: 8,
  totalClues: 4,
  soloScore: 8,
} as const;

function fakePuzzle(title: string, size: number): Puzzle {
  return { title, author: "", width: size, height: size, cells: [], clues: [] } as unknown as Puzzle;
}
const NEXT_DAILIES: NextUpItem[] = [
  { kind: "daily", slot: "midi", daily: { theme: "Jazz", puzzle: fakePuzzle("Blue Note", 9) } },
  { kind: "daily", slot: "large", daily: { theme: "Film", puzzle: fakePuzzle("Reel Deal", 15) } },
];

function makePlayers(): PlayerResult[] {
  return [
    { userId: "alice", displayName: "Alice", color: "#3b82f6", cellsClaimed: 5, cluesCompleted: 2 },
    { userId: "bob", displayName: "Bob", color: "#ef4444", cellsClaimed: 3, cluesCompleted: 1 },
  ];
}

describe("CompletionModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <CompletionModal open={false} totalCells={8} totalClues={4} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders solo variant with score", () => {
    const { getByText } = render(<CompletionModal {...SOLO_PROPS} />);
    expect(getByText("Puzzle complete")).toBeTruthy();
    expect(getByText("8/8 cells filled")).toBeTruthy();
  });

  it("shows the NYT 'same time tomorrow' hook only for bookmarklet puzzles", () => {
    const { queryByTestId, rerender, getByTestId, getByText } = render(
      <CompletionModal {...SOLO_PROPS} />,
    );
    expect(queryByTestId("nyt-hook")).toBeNull();

    rerender(<CompletionModal {...SOLO_PROPS} nytHook={{ streak: 0 }} />);
    expect(getByTestId("nyt-hook").textContent).toContain("Same time tomorrow?");
    expect(getByTestId("nyt-hook").textContent).not.toContain("streak");

    rerender(<CompletionModal {...SOLO_PROPS} nytHook={{ streak: 3 }} />);
    expect(getByText("3-day NYT streak")).toBeTruthy();
    expect(getByTestId("nyt-hook").textContent).toContain("Same time tomorrow?");
  });

  it("renders multiplayer variant with winner", () => {
    const { getByText } = render(
      <CompletionModal open={true} totalCells={8} totalClues={4} players={makePlayers()} />,
    );
    expect(getByText("Alice wins with 5 squares!")).toBeTruthy();
    expect(getByText("Squares")).toBeTruthy();
    expect(getByText("Alice")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
  });

  it("shows tie message when scores are equal", () => {
    const players = makePlayers();
    players[1].cellsClaimed = 5; // Same as Alice
    const { getByText } = render(
      <CompletionModal open={true} totalCells={10} totalClues={4} players={players} />,
    );
    expect(getByText("It's a tie at 5 squares!")).toBeTruthy();
  });

  describe("share-square legend under the preview", () => {
    const puzzle = buildPuzzle({ title: "Deep Blue", grid: ["#whom", "trace", "holes", "atlas", "neon#"], clueTexts: {} });
    // 11 wide: the block is the single 15-square pace bar, not grid rows.
    const wide = buildPuzzle({ title: "Wide", grid: ["abcdefghijk", "abcdefghijk"], clueTexts: {} });
    const cells = {
      "0,1": { letter: "W", correct: true, playerId: "bob", at: 1 },
      "1,0": { letter: "T", correct: true, playerId: "alice", at: 2 },
    };
    const colors = { alice: "#3b82f6", bob: "#ef4444" };

    it("grid rows in a race: names each claimant after their square, in the standings order", () => {
      const { getByTestId } = render(
        <CompletionModal {...SOLO_PROPS} players={makePlayers()} currentUserId="alice" challengePuzzle={puzzle} playerCells={cells} playerColors={colors} challengerName="Alice" />,
      );
      expect(getByTestId("share-legend").textContent).toBe("Who solved each square: 🟦 Alice, 🟥 Bob");
      expect(getByTestId("share-block-preview").textContent).toContain("⬛🟥⬜⬜⬜");
    });

    it("grid rows in solo: the pace thirds and the wrong-letter red", () => {
      const { getByTestId } = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} challengePuzzle={puzzle} playerCells={cells} challengerName="Alice" />);
      expect(getByTestId("share-legend").textContent).toBe("🟩 early · 🟨 mid · 🟧 late · 🟥 wrong letter");
    });

    it("pace bar in a race (wider than 9): a fifteenth of the race per square, by who solved most then", () => {
      const { getByTestId } = render(
        <CompletionModal {...SOLO_PROPS} players={makePlayers()} challengePuzzle={wide} playerCells={{}} playerColors={colors} challengerName="Alice" />,
      );
      expect(getByTestId("share-legend").textContent).toBe(
        "Each square is a fifteenth of the race, coloured by who solved most then: 🟦 Alice, 🟥 Bob",
      );
      expect([...getByTestId("share-block-preview").querySelectorAll("div[aria-hidden] > div")]).toHaveLength(1);
    });

    it("pace bar in solo: a fifteenth of the solve per square, fast / even / slow and a wrong letter in that stretch", () => {
      const { getByTestId } = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} challengePuzzle={wide} playerCells={{}} challengerName="Alice" />);
      expect(getByTestId("share-legend").textContent).toBe(
        "Each square is a fifteenth of your solve: 🟩 fast · 🟨 even · 🟧 slow · 🟥 a wrong letter then",
      );
    });

    it("no legend without a puzzle to share", () => {
      const { queryByTestId } = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} />);
      expect(queryByTestId("share-legend")).toBeNull();
    });
  });

  it("shows player stats in table", () => {
    const { container } = render(
      <CompletionModal open={true} totalCells={8} totalClues={4} players={makePlayers()} />,
    );
    const table = container.querySelector("table");
    expect(table).toBeTruthy();
    // Two player rows in tbody
    const rows = table!.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(2);
  });

  it("never offers the importer: no 'New puzzle' action", () => {
    const { queryByText } = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} onBackToMenu={() => {}} />);
    expect(queryByText("New puzzle")).toBeNull();
    expect(queryByText("Play again")).toBeNull();
  });

  it("makes Share the primary action, labelled 'Share your time' after a daily, with the block previewed above it", () => {
    // A real grid: the non-daily share link carries the whole puzzle.
    const puzzle = buildPuzzle({ title: "Deep Blue", grid: ["#whom", "trace", "holes", "atlas", "neon#"], clueTexts: {} });
    const { getByRole, getByTestId, queryByTestId, rerender } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} challengePuzzle={puzzle} challengerName="Andy" />,
    );
    const share = getByRole("button", { name: "Share" });
    expect(share.className).toContain("bg-brand-600");
    expect(getByTestId("share-block-preview").textContent).toContain("Crossword Clash · Deep Blue");
    expect(getByTestId("share-block-preview").textContent).toContain("⏱ 1:30");

    rerender(<CompletionModal {...SOLO_PROPS} finishSeconds={90} dailySlot="mini" challengePuzzle={puzzle} challengerName="Andy" />);
    expect(getByRole("button", { name: "Share your time" }).className).toContain("bg-brand-600");
    expect(getByTestId("share-block-preview").textContent).toContain("Crossword Clash · Daily Mini ·");

    // No puzzle, nothing to share: the section is absent rather than broken.
    rerender(<CompletionModal {...SOLO_PROPS} finishSeconds={90} />);
    expect(queryByTestId("share-block-preview")).toBeNull();
  });

  it("shows the leaderboard and Save image as the secondary row; the share link itself is the challenge", () => {
    const onViewLeaderboard = vi.fn();
    const { getByRole, getByTestId, queryByRole } = render(
      <CompletionModal
        {...SOLO_PROPS}
        finishSeconds={90}
        dailySlot="mini"
        onViewLeaderboard={onViewLeaderboard}
        challengePuzzle={fakePuzzle("Deep Blue", 5)}
        challengerName="Andy"
      />,
    );
    fireEvent.click(getByRole("button", { name: "Daily leaderboard" }));
    expect(onViewLeaderboard).toHaveBeenCalledOnce();
    expect(getByRole("button", { name: "Save image" })).toBeTruthy();
    expect(queryByRole("button", { name: /Challenge a friend/ })).toBeNull();
    expect(getByTestId("share-block-preview").textContent).toMatch(/Beat my time → crosswordclash\.com\/daily\/\d{4}-\d{2}-\d{2}\/mini\?beat=90&by=Andy/);
  });

  it("calls onBackToMenu when button clicked", () => {
    const onBackToMenu = vi.fn();
    const { getByText } = render(
      <CompletionModal {...SOLO_PROPS} onBackToMenu={onBackToMenu} />,
    );
    fireEvent.click(getByText("Back to menu"));
    expect(onBackToMenu).toHaveBeenCalledOnce();
  });

  // The modal is taller than a phone screen, so "Back to menu" at its foot was the only way out
  // for a reader who did not scroll (Andrew, 2026-11-01): a close control sits at the top too.
  it("offers a close control at the top that leaves the same way as Back to menu", () => {
    const onBackToMenu = vi.fn();
    const { getByRole, container } = render(<CompletionModal {...SOLO_PROPS} onBackToMenu={onBackToMenu} />);
    const close = getByRole("button", { name: "Close" });
    const dialog = container.querySelector("[role='dialog']")!;
    expect(dialog.firstElementChild).toBe(close);
    expect(close.classList.contains("size-11")).toBe(true);
    fireEvent.click(close);
    expect(onBackToMenu).toHaveBeenCalledOnce();
  });

  it("has no close control without a way back", () => {
    const { queryByRole } = render(<CompletionModal {...SOLO_PROPS} />);
    expect(queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("says when the streak already counted today, and nothing when the finish advanced it", () => {
    const counted = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} streakCount={6} streakAdvanced={false} />);
    expect(counted.getByText("6-day streak")).toBeTruthy();
    expect(counted.getByText(/Today already counted/)).toBeTruthy();
    counted.unmount();
    const advanced = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} streakCount={6} streakAdvanced />);
    expect(advanced.queryByText(/Today already counted/)).toBeNull();
    advanced.unmount();
    const unknown = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} streakCount={6} />);
    expect(unknown.queryByText(/Today already counted/)).toBeNull();
  });

  it("applies dark mode classes when darkMode is true", () => {
    const { container } = render(
      <CompletionModal {...SOLO_PROPS} darkMode />,
    );
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog?.className).toContain("bg-stage-raised");
  });

  it("applies light mode classes by default", () => {
    const { container } = render(
      <CompletionModal {...SOLO_PROPS} />,
    );
    const dialog = container.querySelector("[role='dialog']");
    expect(dialog?.className).toContain("bg-surface");
  });

  it("does NOT fire confetti when mounted already-complete (reload)", () => {
    // Modal open on first render => a finished puzzle restored on reload, not a
    // fresh win. No celebration should occur.
    const { queryByTestId } = render(<CompletionModal {...SOLO_PROPS} />);
    expect(queryByTestId("confetti-canvas")).toBeNull();
  });

  it("fires confetti once on the transition into completion", () => {
    const { queryByTestId, rerender } = render(
      <CompletionModal {...SOLO_PROPS} open={false} />,
    );
    expect(queryByTestId("confetti-canvas")).toBeNull();
    // Transition closed -> open simulates the puzzle being solved live.
    rerender(<CompletionModal {...SOLO_PROPS} open={true} />);
    expect(queryByTestId("confetti-canvas")).toBeTruthy();
  });

  it("does not re-fire confetti on incidental re-renders", () => {
    const { queryByTestId, rerender } = render(
      <CompletionModal {...SOLO_PROPS} open={false} />,
    );
    rerender(<CompletionModal {...SOLO_PROPS} open={true} />);
    const first = queryByTestId("confetti-canvas");
    expect(first).toBeTruthy();
    // A no-op re-render must not spawn a second confetti instance.
    rerender(<CompletionModal {...SOLO_PROPS} open={true} soloScore={8} />);
    const canvases = document.querySelectorAll("[data-testid='confetti-canvas']");
    expect(canvases.length).toBe(1);
  });

  it("multiplayer host: 'Next puzzle, same room' opens the picker; never a rematch of the solved puzzle", () => {
    const onNextPuzzle = vi.fn();
    const { getByRole, queryByText } = render(
      <CompletionModal {...SOLO_PROPS} players={makePlayers()} onNextPuzzle={onNextPuzzle} />,
    );
    fireEvent.click(getByRole("button", { name: /Next puzzle, same room/ }));
    expect(onNextPuzzle).toHaveBeenCalledOnce();
    expect(queryByText("Play again")).toBeNull();
    expect(queryByText("Up next")).toBeNull();
  });

  it("after a race, a signed-in viewer sees the other players as Add friend rows below the next-puzzle row and above Back to menu; a spectator and a solo finisher see none", async () => {
    friends.active = true;
    const { findByTestId, getByTestId, getByRole, queryByTestId, rerender } = render(
      <CompletionModal {...SOLO_PROPS} players={makePlayers()} currentUserId="alice" onNextPuzzle={() => {}} onBackToMenu={() => {}} />,
    );
    const section = await findByTestId("raced-with");
    expect(section.textContent).toContain("@bob");
    expect(section.textContent).not.toContain("@alice");
    expect(getByRole("button", { name: "Add friend" })).toBeTruthy();
    const nextPuzzle = getByRole("button", { name: /Next puzzle, same room/ });
    const back = getByRole("button", { name: "Back to menu" });
    expect(nextPuzzle.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(section.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // A spectator (no viewer id) is never suggested anyone.
    rerender(<CompletionModal {...SOLO_PROPS} players={makePlayers()} onNextPuzzle={() => {}} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(queryByTestId("raced-with")).toBeNull();
    // Neither is a solo finisher.
    rerender(<CompletionModal {...SOLO_PROPS} currentUserId="alice" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(queryByTestId("raced-with")).toBeNull();
    expect(getByTestId).toBeTruthy();
  });

  it("multiplayer guest: no next-puzzle row without onNextPuzzle", () => {
    const { queryByText } = render(<CompletionModal {...SOLO_PROPS} players={makePlayers()} />);
    expect(queryByText(/Next puzzle, same room/)).toBeNull();
  });

  it("hides the fresh race row when onRaceFresh is undefined (multiplayer unavailable)", () => {
    const { queryByText } = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} />);
    expect(queryByText("Race a friend live")).toBeNull();
  });

  it("'Race a friend live' calls onRaceFresh and emits the live_bridge funnel event", () => {
    const onRaceFresh = vi.fn();
    const { getByRole } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} puzzleSize="15x15" onRaceFresh={onRaceFresh} />,
    );
    fireEvent.click(getByRole("button", { name: /Race a friend live/ }));
    expect(onRaceFresh).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith("live_bridge", { mode: "live", from: "solo", size: "15x15" });
  });

  it("marks the live bridge as a challenge rematch after racing a ghost", () => {
    const { getByRole } = render(
      <CompletionModal
        {...SOLO_PROPS}
        finishSeconds={90}
        puzzleSize="15x15"
        onRaceFresh={() => {}}
        challengeOutcome={{ outcome: "beat", deltaSeconds: 12, challengerName: "Alex" }}
      />,
    );
    fireEvent.click(getByRole("button", { name: /Race a friend live/ }));
    expect(track).toHaveBeenCalledWith("live_bridge", { mode: "live", from: "challenge_result", size: "15x15" });
  });

  it("lists 'Up next' dailies with size and theme, and hands the picked item back", () => {
    const onNextUp = vi.fn();
    const { getByText, getByRole, getByTestId } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} nextUp={NEXT_DAILIES} onNextUp={onNextUp} />,
    );
    expect(getByText("Up next")).toBeTruthy();
    const rows = getByTestId("up-next").querySelectorAll("button");
    expect(rows).toHaveLength(2);
    expect(getByText("9×9 · Jazz")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /Daily Large/ }));
    expect(onNextUp).toHaveBeenCalledWith(NEXT_DAILIES[1]);
  });

  it("offers yesterday's daily by slot with its size and theme when today's are done", () => {
    const onNextUp = vi.fn();
    const entry = { day: "2026-10-19", slot: "midi" as const, title: "Blue Note", theme: "Jazz", author: "", width: 9, height: 9, clues: 20, identity: "y-midi", blocks: "" };
    const { getByRole, getByText } = render(<CompletionModal {...SOLO_PROPS} finishSeconds={90} nextUp={[{ kind: "archive", entry }]} onNextUp={onNextUp} />);
    expect(getByText("9×9 · Jazz")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: /Yesterday's Daily Midi/ }));
    expect(onNextUp).toHaveBeenCalledWith({ kind: "archive", entry });
  });

  it("shows no 'Up next' heading when there is nothing to suggest yet", () => {
    const { queryByText, getByRole } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} nextUp={[]} onNextUp={() => {}} onRaceFresh={() => {}} />,
    );
    expect(queryByText("Up next")).toBeNull();
    expect(getByRole("button", { name: /Race a friend live/ })).toBeTruthy();
  });

  it("hides the sign-the-board form when dailySign is absent", () => {
    const { queryByPlaceholderText } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} />,
    );
    expect(queryByPlaceholderText("Your name")).toBeNull();
  });

  it("shows the sign-the-board form and submits the typed name", () => {
    const onSign = vi.fn();
    const { getByPlaceholderText, getByText } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} dailySign={{ onSign }} />,
    );
    const input = getByPlaceholderText("Your name");
    fireEvent.change(input, { target: { value: "Andy" } });
    fireEvent.click(getByText("Save"));
    expect(onSign).toHaveBeenCalledWith("Andy");
  });

  it("submits the sign-the-board name on Enter", () => {
    const onSign = vi.fn();
    const { getByPlaceholderText } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} dailySign={{ onSign }} />,
    );
    const input = getByPlaceholderText("Your name");
    fireEvent.change(input, { target: { value: "Andy" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSign).toHaveBeenCalledWith("Andy");
  });

  it("does not submit an empty sign-the-board name", () => {
    const onSign = vi.fn();
    const { getByPlaceholderText } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} dailySign={{ onSign }} />,
    );
    fireEvent.keyDown(getByPlaceholderText("Your name"), { key: "Enter" });
    expect(onSign).not.toHaveBeenCalled();
  });

  it("asks for a name to post an unposted finish, with a Post button", () => {
    const onSign = vi.fn();
    const { getByPlaceholderText, getByText, queryByText } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} dailySign={{ onSign, unposted: true }} />,
    );
    expect(getByText("Add your name to post your time to today's board")).toBeTruthy();
    expect(queryByText(/on today's board as/)).toBeNull();
    fireEvent.change(getByPlaceholderText("Your name"), { target: { value: "Andy" } });
    fireEvent.click(getByText("Post"));
    expect(onSign).toHaveBeenCalledWith("Andy");
  });

  it("keeps signing a solo share separate from posting the guest time", async () => {
    const onSign = vi.fn();
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.share = share;
    try {
      const { getByTestId } = render(
        <CompletionModal {...SOLO_PROPS} finishSeconds={90} dailySlot="mini"
          challengePuzzle={fakePuzzle("Deep Blue", 5)} challengerName="Player"
          dailySign={{ onSign, unposted: true }} />,
      );
      const sharing = within(getByTestId("share-result"));
      fireEvent.click(sharing.getByRole("button", { name: "Share your time" }));
      const name = sharing.getByPlaceholderText("Your name");
      fireEvent.change(name, { target: { value: "Sam" } });
      fireEvent.keyDown(name, { key: "Enter" });
      await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
      expect(share.mock.calls[0][0].text).toContain("by=Sam");
      expect(onSign).not.toHaveBeenCalled();
    } finally {
      delete (navigator as Partial<Navigator>).share;
    }
  });

  it("says quietly that a preview's finish was not posted, instead of offering a signature", () => {
    const { getByTestId, queryByPlaceholderText } = render(
      <CompletionModal {...SOLO_PROPS} finishSeconds={90} boardNotPosted />,
    );
    expect(getByTestId("board-not-posted").textContent).toBe("Preview: not posted to the board");
    expect(queryByPlaceholderText("Your name")).toBeNull();
  });

  it("shows a confirmation instead of the form once signed", () => {
    const { queryByPlaceholderText, getByText } = render(
      <CompletionModal
        {...SOLO_PROPS}
        finishSeconds={90}
        dailySign={{ signedAs: "Andy", onSign: vi.fn() }}
      />,
    );
    expect(queryByPlaceholderText("Your name")).toBeNull();
    expect(getByText("On the board as Andy ✓")).toBeTruthy();
  });

  it("nudges an anonymous finisher to save their history only when asked to", () => {
    const { queryByTestId } = render(<CompletionModal {...SOLO_PROPS} />);
    expect(queryByTestId("account-hook")).toBeNull();
    cleanup();

    const onSignIn = vi.fn();
    const { getByTestId, getByRole } = render(<CompletionModal {...SOLO_PROPS} onSignIn={onSignIn} />);
    expect(getByTestId("account-hook").textContent).toContain("Keep this solve");
    fireEvent.click(getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });
});

vi.mock("../Push", () => ({ ReminderSwitch: () => null }));
