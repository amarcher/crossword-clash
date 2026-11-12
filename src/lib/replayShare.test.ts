import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn() }));
vi.mock("./supabaseClient", () => ({
  supabase: {
    rpc,
    from: () => {
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue({ maybeSingle });
      return query;
    },
  },
}));

const { createReplayShare, fetchReplayShare, ghostFromReplay } = await import("./replayShare");
const { encodeReplay } = await import("./replayCode");

afterEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
});

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

describe("racing a shared link's sender", () => {
  it("reads a shared code by its ID, and nothing for a malformed ID", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { code: "AgUFEAAQ" }, error: null });
    expect(await fetchReplayShare("E0Gqr8Iw09i")).toBe("AgUFEAAQ");
    expect(query.eq).toHaveBeenCalledWith("id", "E0Gqr8Iw09i");
    expect(await fetchReplayShare("../x")).toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchReplayShare("E0Gqr8Iw09i")).toBeNull();
  });

  it("turns the sender's replay into a ghost: right and wrong letters fill, erases empty, the rest is left out", () => {
    const grid = { width: 2, height: 1, cells: [[{ solution: "A" }, { solution: "B" }]] };
    const code = encodeReplay(grid, [[1000, 0, "Q"], [1500, 0, ""], [2000, 0, "A"], [3000, 1, "B"]], 4, [[0, 0, "a"], [2500, 1, "r"]])!;
    const ghost = ghostFromReplay(code, "E0Gqr8Iw09i", "Andrew")!;
    expect(ghost).toMatchObject({ userId: "link:E0Gqr8Iw09i", name: "Andrew", seconds: 4 });
    expect(ghost.events).toEqual([[1000, 0, 1], [1500, 0, 0], [2000, 0, 1], [3000, 1, 1]]);
    expect(ghostFromReplay("nope", "E0Gqr8Iw09i", "Andrew")).toBeNull();
  });
});
