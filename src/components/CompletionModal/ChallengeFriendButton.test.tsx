// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ChallengeFriendButton } from "./ChallengeFriendButton";
import { normalizeTransferPuzzle } from "../../lib/puzzleNormalizer";
import { parseChallengeUrl } from "../../lib/challenge";
import type { TransferPuzzle } from "../../lib/puzzleNormalizer";

function makePuzzle() {
  const transfer: TransferPuzzle = {
    title: "Test Puzzle",
    author: "Test Author",
    size: { rows: 3, cols: 3 },
    grid: ["C", "A", "T", "A", ".", "O", "B", "E", "T"],
    gridnums: [1, 0, 2, 0, 0, 0, 3, 0, 0],
    clues: { across: ["1. Feline", "3. Wager"], down: ["1. Taxi", "2. Digit"] },
    answers: { across: ["CAT", "BET"], down: ["CAB", "TOT"] },
  };
  return normalizeTransferPuzzle(transfer);
}

describe("ChallengeFriendButton", () => {
  let shared: { text?: string; url?: string } | null;

  beforeEach(() => {
    shared = null;
    navigator.share = vi.fn((data?: ShareData) => {
      shared = data ?? null;
      return Promise.resolve();
    });
  });

  afterEach(() => {
    delete (navigator as Partial<Navigator>).share;
    cleanup();
  });

  it("shares in one tap when the finisher already has a real name", async () => {
    render(<ChallengeFriendButton puzzle={makePuzzle()} challengerName="Alex" finishSeconds={272} />);
    fireEvent.click(screen.getByText("🏁 Challenge a Friend"));
    await Promise.resolve();
    expect(navigator.share).toHaveBeenCalledTimes(1);
    expect(parseChallengeUrl(shared!.url!)?.payload.name).toBe("Alex");
  });

  it("prompts the finisher to sign when they have no real name (does not share yet)", () => {
    // "Player" is the generic default — treat as no real name.
    render(<ChallengeFriendButton puzzle={makePuzzle()} challengerName="Player" finishSeconds={90} />);
    fireEvent.click(screen.getByText("🏁 Challenge a Friend"));
    expect(navigator.share).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Your name")).toBeTruthy();
  });

  it("falls back to 'A friend' when the challenge is sent unsigned", async () => {
    render(<ChallengeFriendButton puzzle={makePuzzle()} challengerName="" finishSeconds={90} />);
    fireEvent.click(screen.getByText("🏁 Challenge a Friend"));
    fireEvent.click(screen.getByText("Send Challenge")); // leave the name blank
    await Promise.resolve();
    expect(parseChallengeUrl(shared!.url!)?.payload.name).toBe("A friend");
  });
});
