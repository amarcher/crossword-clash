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
  it("names the friend who solved it; Race opens the picker for every player", () => {
    render(<RaceStarter candidates={candidates} preselect={[]} onStart={vi.fn()} />);
    expect(screen.getByText("sam solved this. Race their solve")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Race" }));
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("offers the fastest public solvers when no friend has solved it", () => {
    render(<RaceStarter candidates={candidates.slice(1)} preselect={[]} onStart={vi.fn()} />);
    expect(screen.getByText("Race the fastest solvers")).toBeTruthy();
  });

  it("lets Plus pick up to three and starts the race with them", async () => {
    const onStart = vi.fn(async () => true);
    render(<RaceStarter candidates={candidates} preselect={[]} onStart={onStart} />);
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
    render(<RaceStarter candidates={candidates} preselect={["p2"]} onStart={async () => false} />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([false, false, true, false]);
    fireEvent.click(screen.getByRole("button", { name: "Start race" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });
});
