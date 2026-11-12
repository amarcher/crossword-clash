import { afterEach, describe, expect, it, vi } from "vitest";
import { clockText, decodeReplay, drawFrames, FRAME_COUNT, FPS, GET, H, renderVideo, W } from "./replay";
import { decodeReplay as decodeInApp, encodeReplay } from "../src/lib/replayCode";
import type { ReplayMark, TraceEvent } from "../src/lib/race";

/** A 3×3 with one black square (the centre); every answer is "A". */
const puzzle = {
  width: 3,
  height: 3,
  cells: [0, 1, 2].map((r) => [0, 1, 2].map((c) => ({ solution: r === 1 && c === 1 ? null : "A" }))),
};
const WHITE_CELLS = [0, 1, 2, 3, 5, 6, 7, 8];
/** Solved left to right over 30 s; square 1 first takes a wrong letter, and a refusal flashes on square 2. */
const events: TraceEvent[] = [
  [0, 0, "A"],
  [2000, 1, "Z"],
  [5000, 1, "A"],
  ...WHITE_CELLS.slice(2).map((cell, i): TraceEvent => [12000 + i * 2500, cell, "A"]),
];
const marks: ReplayMark[] = [
  [0, 0, "a"],
  [6000, 2, "r"],
  [7500, 3, "d"],
];

/** The colour of a white square's centre in a frame. */
function colourAt(frame: Uint8Array, cell: number): string {
  // The 3×3 layout (layoutFor): side 3, gap 4 → 194 px squares, grid centred in the 600 px box at x 90.
  const size = 194;
  const gap = 4;
  const gridW = size * 3 + gap * 4;
  const x0 = 90 + Math.floor((600 - gridW) / 2);
  const y0 = Math.floor((H - gridW) / 2);
  const x = x0 + gap + (cell % 3) * (size + gap) + size / 2;
  const y = y0 + gap + Math.floor(cell / 3) * (size + gap) + size / 2;
  const i = (Math.round(y) * W + Math.round(x)) * 3;
  return `${frame[i]},${frame[i + 1]},${frame[i + 2]}`;
}
const BLUE = "58,107,240";
const RED = "239,68,68";
const GOLD = "253,239,196";
const WHITE = "255,255,255";

describe("replay codes", () => {
  it("decodes what the app encodes, in both decoders", () => {
    const code = encodeReplay(puzzle, events, 30, marks)!;
    expect(decodeReplay(code)).toEqual(decodeInApp(code));
  });

  it("refuses anything malformed, a first-version code included", () => {
    const code = encodeReplay(puzzle, events, 30, marks)!;
    expect(decodeReplay(code)).not.toBeNull();
    for (const bad of ["", "!!!!", "AQIBAAIBAA", "AgIBAAIGAA", "AgIBAAIBEA"]) expect(decodeReplay(bad)).toBeNull();
  });
});

describe("drawing", () => {
  it("formats the clock as m:ss", () => {
    expect(clockText(0)).toBe("0:00");
    expect(clockText(102.9)).toBe("1:42");
    expect(clockText(612)).toBe("10:12");
  });

  it("shows right letters blue, a wrong one red, a refusal as a red flash, and the clue being worked on in pale gold", async () => {
    const replay = decodeReplay(encodeReplay(puzzle, events, 30, marks)!)!;
    // The solve's 30 s play in 4.5 s: solve time t lands on frame t / 30 * 4.5 * FPS.
    const frameAt = (ms: number) => Math.ceil((ms / 30000) * 4.5 * FPS);
    const wanted = new Map([
      [frameAt(1000), "early"],
      [frameAt(3000), "wrong"],
      [frameAt(6500), "flash"],
      [frameAt(10000), "cleared"],
    ]);
    const seen = new Map<string, Uint8Array>();
    let last: Uint8Array | null = null;
    let count = 0;
    await drawFrames(replay, (frame, i) => {
      count++;
      if (wanted.has(i)) seen.set(wanted.get(i)!, Uint8Array.from(frame));
      last = Uint8Array.from(frame);
    });
    expect(count).toBe(FRAME_COUNT);
    // Early: square 0 right; the rest of 1-Across (squares 1, 2) is the clue being worked on.
    expect([0, 1, 2].map((c) => colourAt(seen.get("early")!, c))).toEqual([BLUE, GOLD, GOLD]);
    expect(colourAt(seen.get("early")!, 3)).toBe(WHITE);
    // A wrong letter on square 1 is red until it is fixed.
    expect(colourAt(seen.get("wrong")!, 1)).toBe(RED);
    // The refusal on square 2 flashes red, then the square is empty again (the solver has moved on to 3-Down).
    expect(colourAt(seen.get("flash")!, 2)).toBe(RED);
    expect(colourAt(seen.get("cleared")!, 2)).toBe(WHITE);
    expect([3, 6].map((c) => colourAt(seen.get("cleared")!, c))).toEqual([GOLD, GOLD]);
    // The last frame: every square right, no gold.
    expect(WHITE_CELLS.map((c) => colourAt(last!, c))).toEqual(WHITE_CELLS.map(() => BLUE));
  });
});

describe("the endpoint", () => {
  it("answers a malformed code with 400", async () => {
    const res = await GET(new Request("https://x.test/api/replay?r=nope!"));
    expect(res.status).toBe(400);
  });

  it("renders a faststart H.264 MP4 cached for good", async () => {
    const code = encodeReplay(puzzle, events, 30, marks)!;
    const res = await GET(new Request(`https://x.test/api/replay?r=${code}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("cache-control")).toContain("immutable");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    // faststart: the movie header comes before the media data.
    expect(text.indexOf("moov")).toBeGreaterThan(-1);
    expect(text.indexOf("moov")).toBeLessThan(text.indexOf("mdat") === -1 ? Infinity : text.indexOf("mdat"));
    expect(text).toContain("avc1");
  }, 30_000);

  it("renders the poster as a JPEG", async () => {
    const code = encodeReplay(puzzle, events, 30, marks)!;
    const res = await GET(new Request(`https://x.test/api/replay?r=${code}&poster=1`));
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  }, 30_000);
});

describe("share IDs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const serve = (rows: unknown, ok = true) => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://db.test");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return { ok, json: async () => rows };
    });
    return calls;
  };

  it("looks the code up by ID and renders it", async () => {
    const calls = serve([{ code: encodeReplay(puzzle, events, 30, marks) }]);
    const res = await GET(new Request("https://x.test/api/replay?s=VJ0ncnWyJ9j&poster=1"));
    expect(calls).toEqual(["https://db.test/rest/v1/replay_shares?id=eq.VJ0ncnWyJ9j&select=code"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
  }, 30_000);

  it("answers an unknown ID 404 (briefly cached) and a database error 503 (not cached), and never asks for a malformed one", async () => {
    serve([]);
    const missing = await GET(new Request("https://x.test/api/replay?s=VJ0ncnWyJ9j"));
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("public, max-age=300");
    serve([], false);
    const down = await GET(new Request("https://x.test/api/replay?s=VJ0ncnWyJ9j"));
    expect(down.status).toBe(503);
    expect(down.headers.get("cache-control")).toBe("no-store");
    const calls = serve([]);
    expect((await GET(new Request("https://x.test/api/replay?s=../etc"))).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("renderVideo", () => {
  it("keeps a large grid's clip small", async () => {
    const big = { width: 15, height: 15, cells: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => ({ solution: "A" }))) };
    const ev: TraceEvent[] = Array.from({ length: 225 }, (_, i) => [i * 2000, i, i % 9 === 0 ? "B" : "A"]);
    const mp4 = await renderVideo(decodeReplay(encodeReplay(big, ev, 450)!)!);
    expect(mp4.length).toBeLessThan(400_000);
  }, 30_000);
});
