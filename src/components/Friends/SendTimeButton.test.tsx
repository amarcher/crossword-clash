// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";
import { buildPuzzle } from "../../lib/samplePuzzles";

const beat = vi.fn(async () => {});
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "me" } }) }));
vi.mock("../../contexts/FriendsContext", () => ({ useFriends: () => ({ beat }) }));
vi.mock("../../hooks/useRaceName", () => ({ useRaceName: () => "archer" }));
vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
const replay = vi.hoisted(() => ({ remembered: null as string | null, create: vi.fn(async () => "E0Gqr8Iw09i" as string | null), remember: vi.fn() }));
vi.mock("../../lib/replayShare", () => ({ rememberedReplay: () => replay.remembered, createReplayShare: replay.create, rememberReplay: replay.remember }));
const trace = vi.hoisted(() => ({ kept: null as { seconds: number; events: [number, number, string][] } | null }));
vi.mock("../../lib/race", async (original) => ({ ...(await original<typeof import("../../lib/race")>()), fetchOwnSolveTrace: async () => trace.kept }));

import { SendTimeButton } from "./SendTimeButton";

const puzzle = buildPuzzle({ title: "Tiny", grid: ["ab", "cd"], clueTexts: {} });
const show = () => render(<SendTimeButton puzzle={puzzle} puzzleKey="k" linkRef={{ day: "2026-11-18", slot: "mini" }} seconds={62} friendId="cy" friendName="cy" />);

describe("SendTimeButton", () => {
  afterEach(() => {
    cleanup();
    beat.mockClear();
    replay.create.mockClear();
    replay.remembered = null;
    trace.kept = null;
  });

  it("sends the puzzle's link with the time, the name and the replay this device filed, then says Sent", async () => {
    replay.remembered = "AAAAAAAAAAA";
    show();
    fireEvent.click(screen.getByRole("button", { name: "Send @cy your time to race" }));
    await waitFor(() => expect(screen.getByText("Sent")).toBeTruthy());
    expect(beat).toHaveBeenCalledWith("cy", "/daily/2026-11-18/mini?beat=62&by=archer&r=AAAAAAAAAAA");
    expect(replay.create).not.toHaveBeenCalled();
  });

  it("makes the replay from the account's kept recording of that finish; with none, sends the time alone", async () => {
    trace.kept = { seconds: 62, events: [[1000, 0, "A"], [2000, 1, "B"], [3000, 2, "C"], [62000, 3, "D"]] };
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(beat).toHaveBeenCalledWith("cy", "/daily/2026-11-18/mini?beat=62&by=archer&r=E0Gqr8Iw09i"));
    cleanup();
    beat.mockClear();
    trace.kept = null;
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(beat).toHaveBeenCalledWith("cy", "/daily/2026-11-18/mini?beat=62&by=archer"));
  });

  it("keeps the button, as Try again, when the send is refused", async () => {
    beat.mockRejectedValueOnce(new Error("no"));
    show();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button").textContent).toBe("Try again"));
    expect(screen.getByRole("alert").textContent).toBe("That didn't go through. Please try again.");
  });
});
