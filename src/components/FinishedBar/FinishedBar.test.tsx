// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FinishedBar } from "./FinishedBar";

afterEach(cleanup);

describe("FinishedBar", () => {
  it("shows the finish time and offers Share and Leaderboard", () => {
    const onShare = vi.fn();
    const onLeaderboard = vi.fn();
    render(<FinishedBar seconds={102} onShare={onShare} onLeaderboard={onLeaderboard} />);
    expect(screen.getByLabelText("Solved in 1:42")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onLeaderboard).toHaveBeenCalledTimes(1);
  });

  it("hides the Leaderboard action when the puzzle is not a daily", () => {
    render(<FinishedBar seconds={5} onShare={() => {}} />);
    expect(screen.queryByRole("button", { name: "Leaderboard" })).toBeNull();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });

  it("says just Solved for a finish with no personal time", () => {
    render(<FinishedBar seconds={null} onShare={() => {}} />);
    expect(screen.getByLabelText("Solved")).toBeTruthy();
  });
});
