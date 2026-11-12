// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import { RaceStarter } from "./RaceStarter";
import type { RaceCandidate } from "../../lib/race";

afterEach(cleanup);

const candidates: RaceCandidate[] = [
  { userId: "f1", username: "sam", seconds: 95, friend: true },
  { userId: "p1", username: "speedy", seconds: 60, friend: false },
  { userId: "p2", username: "quick", seconds: 70, friend: false },
  { userId: "p3", username: "fast", seconds: 80, friend: false },
];

describe("RaceStarter", () => {
  it("names the friend who solved it; a free player's Race opens the Plus pitch", () => {
    const onPitch = vi.fn();
    render(<RaceStarter candidates={candidates} plus={false} preselect={[]} onStart={vi.fn()} onPitch={onPitch} />);
    expect(screen.getByText("sam solved this. Race their solve")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Race with Plus" }));
    expect(onPitch).toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("offers the fastest public solvers when no friend has solved it", () => {
    render(<RaceStarter candidates={candidates.slice(1)} plus preselect={[]} onStart={vi.fn()} onPitch={vi.fn()} />);
    expect(screen.getByText("Race the fastest solvers of this puzzle")).toBeTruthy();
  });

  it("lets Plus pick up to three and starts the race with them", async () => {
    const onStart = vi.fn(async () => true);
    render(<RaceStarter candidates={candidates} plus preselect={[]} onStart={onStart} onPitch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Race" }));
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    // The friend is ticked to start with; two more fill the race and the fourth can't be added.
    expect(boxes[0].checked).toBe(true);
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    expect(boxes[3].disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Race 3" }));
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(["f1", "p1", "p2"]));
  });

  it("opens with a board's preselected player ticked, and says so when a solve can't load", async () => {
    render(<RaceStarter candidates={candidates} plus preselect={["p2"]} onStart={async () => false} onPitch={vi.fn()} />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, false, true, false]);
    fireEvent.click(screen.getByRole("button", { name: "Start race" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
