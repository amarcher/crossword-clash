// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n/i18n";
import { BoardTable } from "./BoardTable";
import type { RankedDailyEntry } from "../../lib/dailyLeaderboard";

/** A row's action is a button, Race before the viewer solves and Watch after; the mode tag is only a tag (Andrew, 2026-11-16). */
const rows = [
  { rank: 1, userId: "ann", displayName: "ann", seconds: 108, mode: "race" },
  { rank: 2, userId: "me", displayName: "archer", seconds: 192, mode: "solo" },
  { rank: 3, userId: "bo", displayName: "bo", seconds: 240, mode: "solo" },
] as RankedDailyEntry[];

afterEach(cleanup);

describe("BoardTable row actions", () => {
  it("offers Race on the rows that can be raced, never on the viewer's own", () => {
    const onRace = vi.fn();
    render(<BoardTable rows={rows} userId="me" raceable={new Set(["ann", "me"])} onRace={onRace} onWatch={() => {}} />);
    expect(screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Race ann's solve"]);
    fireEvent.click(screen.getByRole("button", { name: "Race ann's solve" }));
    expect(onRace).toHaveBeenCalledWith("ann");
    // The tag for a time set in a room says so in words that are not the button's.
    expect(screen.getByText("Live race").closest("button")).toBeNull();
  });

  it("offers Watch instead once the viewer has solved", () => {
    const onWatch = vi.fn();
    render(<BoardTable rows={rows} userId="me" onRace={() => {}} watchable={new Set(["ann", "bo"])} onWatch={onWatch} />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Watch", "Watch"]);
    fireEvent.click(screen.getByRole("button", { name: "Watch bo's solve" }));
    expect(onWatch).toHaveBeenCalledWith("bo");
  });
});
