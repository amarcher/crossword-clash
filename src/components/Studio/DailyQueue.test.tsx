// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { gridFromRows } from "../../lib/seedgrid/grid";
import { initialStudioState, type StudioState } from "../../lib/seedgrid/studioState";
import { upcomingDays } from "../../lib/seedgrid/studioSchedule";

const schedule = vi.hoisted(() => ({ listSchedule: vi.fn(), fetchStockedDays: vi.fn(), scheduleDay: vi.fn(), unscheduleDay: vi.fn() }));
vi.mock("../../lib/seedgrid/studioSchedule", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/seedgrid/studioSchedule")>()), ...schedule }));
vi.mock("../../hooks/useStudioToken", () => ({ useStudioToken: () => "tok", setStudioToken: vi.fn() }));

const { DailyQueue } = await import("./DailyQueue");

const [today, tomorrow, dayAfter] = upcomingDays(new Date(), 3);
const state = (): StudioState => ({ ...initialStudioState(3, "p-mine"), grid: gridFromRows(["BAT", "ORE", "WED"]), title: "Mine" });

beforeEach(() => {
  schedule.listSchedule.mockReset().mockResolvedValue([
    { day: today, slot: "mini", title: "Queued mini", studio_id: "p-other" },
    { day: tomorrow, slot: "large", title: "Queued large", studio_id: "p-mine" },
  ]);
  schedule.fetchStockedDays.mockReset().mockResolvedValue([
    { day: today, slot: "mini", title: "Stocked mini" },
    { day: dayAfter, slot: "midi", title: "Stocked midi" },
  ]);
  schedule.unscheduleDay.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("DailyQueue", () => {
  it("shows a committed file ahead of the queue, the queue where no file exists, and the rotation otherwise", async () => {
    render(<DailyQueue state={state()} admin />);
    await waitFor(() => expect(screen.getByText("Stocked mini")).toBeTruthy());
    // The file wins today's mini and says the queued snapshot is shadowed.
    const fileRow = screen.getByText("Stocked mini").closest("div")!;
    expect(fileRow.textContent).toContain("File");
    expect(screen.getByText(/Queued “Queued mini” won't be served/)).toBeTruthy();
    expect(screen.queryByText("Queued mini")).toBeNull();
    // A queued day with no file is served from the queue.
    const queued = screen.getByText("Queued large").closest("span")!;
    expect(queued.textContent).toContain("Queue");
    expect(screen.getByText("Stocked midi")).toBeTruthy();
    // Nothing for today's large; the rotation for a mini nobody stocked.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Rotation").length).toBeGreaterThan(0);
  });

  it("still lets the admin unschedule a shadowed snapshot", async () => {
    render(<DailyQueue state={state()} admin />);
    await waitFor(() => expect(screen.getByText("Stocked mini")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Unschedule Queued mini \(Mini\) on Today/ }));
    fireEvent.click(screen.getByRole("button", { name: "Unschedule" }));
    await waitFor(() => expect(schedule.unscheduleDay).toHaveBeenCalledWith("tok", today, "mini"));
  });

  it("warns when the chosen day already has a committed file", async () => {
    render(<DailyQueue state={state()} admin />);
    await waitFor(() => expect(screen.getByText("Stocked mini")).toBeTruthy());
    // Tomorrow is the default day; today has the file.
    fireEvent.click(screen.getByRole("combobox", { name: "Day" }));
    fireEvent.click(screen.getByRole("option", { name: /^Today · Stocked mini \(file\)/ }));
    expect(screen.getByText(/“Stocked mini” is committed as that day's Mini/)).toBeTruthy();
  });
});
