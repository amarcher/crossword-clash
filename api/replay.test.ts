import { describe, expect, it } from "vitest";
import { clockText, decodeReplay, drawFrames, FRAME_COUNT, GET, H, renderVideo, W } from "./replay";
import { decodeReplay as decodeInApp, encodeReplay } from "../src/lib/replayCode";
import type { TraceEvent } from "../src/lib/race";

/** A 3×3 with one black square (the centre) solved left to right over 30 seconds. */
const puzzle = {
  width: 3,
  height: 3,
  cells: [0, 1, 2].map((r) => [0, 1, 2].map((c) => ({ solution: r === 1 && c === 1 ? null : "A" }))),
};
const events: TraceEvent[] = [0, 1, 2, 3, 5, 6, 7, 8].map((cell, i) => [i * 3500, cell, "A"]);

describe("replay codes", () => {
  it("decodes what the app encodes, in both decoders", () => {
    const code = encodeReplay(puzzle, events, 30)!;
    const fromApi = decodeReplay(code);
    expect(fromApi).toEqual(decodeInApp(code));
    expect(fromApi).toMatchObject({ width: 3, height: 3, seconds: 30 });
    expect(fromApi!.blocks).toEqual([false, false, false, false, true, false, false, false, false]);
    expect(fromApi!.fills).toEqual([0, 3500, 7000, 10500, null, 14000, 17500, 21000, 24500]);
  });

  it("refuses anything malformed", () => {
    const code = encodeReplay(puzzle, events, 30)!;
    for (const bad of ["", "!!!!", code.slice(0, -2), `${code}AA`, "AgMDAAA"]) expect(decodeReplay(bad)).toBeNull();
  });
});

describe("drawing", () => {
  it("formats the clock as m:ss", () => {
    expect(clockText(0)).toBe("0:00");
    expect(clockText(102.9)).toBe("1:42");
    expect(clockText(612)).toBe("10:12");
  });

  it("draws every frame, ending with every white square filled", async () => {
    const replay = decodeReplay(encodeReplay(puzzle, events, 30)!)!;
    let count = 0;
    let last: Uint8Array | null = null;
    await drawFrames(replay, (frame) => {
      count++;
      last = Uint8Array.from(frame);
    });
    expect(count).toBe(FRAME_COUNT);
    expect(last!.length).toBe(W * H * 3);
    // No pure white (an empty square) is left anywhere in the grid area once the solve has played.
    let white = 0;
    for (let y = 60; y < 660; y++) for (let x = 90; x < 690; x++) {
      const i = (y * W + x) * 3;
      if (last![i] === 255 && last![i + 1] === 255 && last![i + 2] === 255) white++;
    }
    expect(white).toBe(0);
  });
});

describe("the endpoint", () => {
  it("answers a malformed code with 400", async () => {
    const res = await GET(new Request("https://x.test/api/replay?r=nope!"));
    expect(res.status).toBe(400);
  });

  it("renders a faststart H.264 MP4 cached for good", async () => {
    const code = encodeReplay(puzzle, events, 30)!;
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
    const code = encodeReplay(puzzle, events, 30)!;
    const res = await GET(new Request(`https://x.test/api/replay?r=${code}&poster=1`));
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  }, 30_000);
});

describe("renderVideo", () => {
  it("keeps a large grid's clip small", async () => {
    const big = { width: 15, height: 15, cells: Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => ({ solution: "A" }))) };
    const ev: TraceEvent[] = Array.from({ length: 225 }, (_, i) => [i * 2000, i, "A"]);
    const mp4 = await renderVideo(decodeReplay(encodeReplay(big, ev, 450)!)!);
    expect(mp4.length).toBeLessThan(400_000);
  }, 30_000);
});
