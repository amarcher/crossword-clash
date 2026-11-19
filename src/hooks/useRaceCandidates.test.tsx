// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

const fetchRaceCandidates = vi.hoisted(() => vi.fn());
vi.mock("../contexts/FriendsContext", () => ({ useFriends: () => ({ active: true }) }));
vi.mock("../lib/race", async (original) => ({ ...(await original<typeof import("../lib/race")>()), fetchRaceCandidates }));

import { clearRaceCandidateCache, prefetchRaceCandidates, useRaceCandidates } from "./useRace";

const row = (userId: string) => ({ userId, username: userId, seconds: 60, friend: true });

describe("useRaceCandidates", () => {
  afterEach(() => {
    cleanup();
    clearRaceCandidateCache();
    fetchRaceCandidates.mockReset();
  });

  it("draws a prefetched puzzle's friends on the first render, then takes the fresh answer", async () => {
    fetchRaceCandidates.mockResolvedValueOnce([row("mia")]);
    prefetchRaceCandidates(["midi-key"]);
    await waitFor(() => expect(fetchRaceCandidates).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    fetchRaceCandidates.mockResolvedValueOnce([row("mia"), row("sam")]);
    const { result } = renderHook(() => useRaceCandidates("midi-key", true));
    expect(result.current.map((c) => c.userId)).toEqual(["mia"]);
    await waitFor(() => expect(result.current.map((c) => c.userId)).toEqual(["mia", "sam"]));
  });

  it("shows the last answer again on a second visit, and nothing for a puzzle never asked about", async () => {
    fetchRaceCandidates.mockResolvedValue([row("mia")]);
    const first = renderHook(() => useRaceCandidates("mini-key", true));
    expect(first.result.current).toEqual([]);
    await waitFor(() => expect(first.result.current).toHaveLength(1));
    first.unmount();
    const again = renderHook(() => useRaceCandidates("mini-key", true));
    expect(again.result.current).toHaveLength(1);
  });
});
