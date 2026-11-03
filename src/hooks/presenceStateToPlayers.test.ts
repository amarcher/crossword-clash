import { describe, expect, it } from "vitest";
import type { RealtimePresenceState } from "@supabase/supabase-js";
import { presenceStateToPlayers } from "./useMultiplayer";

type Tracked = { user_id: string; display_name: string; color: string; visible?: boolean };
const entry = (user_id: string, visible?: boolean): Tracked & { presence_ref: string } => ({ presence_ref: `${user_id}-${String(visible)}`, user_id, display_name: user_id, color: "#000", visible });

describe("presenceStateToPlayers", () => {
  it("marks a player away only when every presence of theirs is hidden; a client without the flag is present", () => {
    const state = {
      k1: [entry("host", false)],
      k2: [entry("me", true)],
      k3: [entry("old")],
    } as unknown as RealtimePresenceState<Tracked>;
    expect(presenceStateToPlayers(state, "g1").map((p) => [p.userId, p.away])).toEqual([
      ["host", true],
      ["me", false],
      ["old", false],
    ]);
  });

  it("a second visible tab of the same player clears the away flag, and the player is listed once", () => {
    const state = { k1: [entry("host", false)], k2: [entry("host", true)] } as unknown as RealtimePresenceState<Tracked>;
    const players = presenceStateToPlayers(state, "g1");
    expect(players).toHaveLength(1);
    expect(players[0].away).toBe(false);
  });
});
