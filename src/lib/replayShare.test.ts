import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("./supabaseClient", () => ({ supabase: { rpc } }));

const { createReplayShare } = await import("./replayShare");

afterEach(() => rpc.mockReset());

describe("createReplayShare", () => {
  it("files the code and returns its share ID", async () => {
    rpc.mockResolvedValueOnce({ data: "VJ0ncnWyJ9j", error: null });
    expect(await createReplayShare("AgUFEAAQ")).toBe("VJ0ncnWyJ9j");
    expect(rpc).toHaveBeenCalledWith("create_replay_share", { p_code: "AgUFEAAQ" });
  });

  it("gives null on an error, a refusal or anything that isn't an ID", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "replays:rate_limited" } });
    expect(await createReplayShare("AgUFEAAQ")).toBeNull();
    rpc.mockResolvedValueOnce({ data: "<nope>", error: null });
    expect(await createReplayShare("AgUFEAAQ")).toBeNull();
    rpc.mockRejectedValueOnce(new Error("offline"));
    expect(await createReplayShare("AgUFEAAQ")).toBeNull();
  });
});
