/**
 * The replay code a shared daily link carries (`?r=…`): enough to draw the
 * solve as it happened, and nothing that gives the puzzle away. It holds the
 * grid's shape and, for every white square, when it was first filled; never a
 * letter. `api/replay.ts` turns it into the short MP4 a link preview plays
 * (and that the completion screen shows the sender first); `api/share.ts`
 * points the link's `og:video` at it.
 *
 * Bytes, then base64url without padding:
 *   [version=1][width][height][block bitset, row-major, ceil(w*h/8) bytes]
 *   [varint: total seconds][per white square, row-major: varint deciseconds+1 of its first fill, 0 = unknown]
 *
 * A mini is about 46 characters, a 15×15 about 550. Pure and unit-tested in
 * replayCode.test.ts; the decoder is mirrored in api/replay.ts (api/ can't
 * import src/), and that test checks the two agree.
 */
import type { PuzzleCell } from "../types/puzzle";
import type { TraceEvent } from "./race";

export const REPLAY_VERSION = 1;
const MAX_SIDE = 25;
const MAX_SECONDS = 36_000;

function pushVarint(out: number[], n: number): void {
  let v = Math.max(0, Math.floor(n));
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

function toBase64Url(bytes: number[]): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The code for a finished solve: the puzzle's shape and each square's first
 * fill from the recording (race.ts events, stripped or not). Null when the
 * puzzle is too large or the solve can't be described.
 */
/** The parts of a puzzle a replay reads: its size and which squares are black. */
type ReplayGrid = { width: number; height: number; cells: readonly (readonly Pick<PuzzleCell, "solution">[])[] };

export function encodeReplay(puzzle: ReplayGrid, events: readonly TraceEvent[], seconds: number): string | null {
  const { width: w, height: h } = puzzle;
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || !Number.isFinite(seconds) || seconds < 0) return null;
  const firstFill = new Map<number, number>();
  for (const [ms, cell, letter] of events) {
    if (letter === "" || letter === 0 || firstFill.has(cell)) continue;
    firstFill.set(cell, ms);
  }
  const bytes: number[] = [REPLAY_VERSION, w, h];
  const bits = new Array<number>(Math.ceil((w * h) / 8)).fill(0);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (puzzle.cells[r]?.[c]?.solution === null) bits[(r * w + c) >> 3] |= 1 << ((r * w + c) & 7);
    }
  }
  bytes.push(...bits);
  const total = Math.min(MAX_SECONDS, Math.floor(seconds));
  pushVarint(bytes, total);
  for (let i = 0; i < w * h; i++) {
    if (puzzle.cells[Math.floor(i / w)]?.[i % w]?.solution === null) continue;
    const ms = firstFill.get(i);
    pushVarint(bytes, ms === undefined ? 0 : Math.min(total * 10 + 10, Math.round(ms / 100)) + 1);
  }
  return toBase64Url(bytes);
}

export interface DecodedReplay {
  width: number;
  height: number;
  /** Per square, row-major: true for a black square. */
  blocks: boolean[];
  seconds: number;
  /** Per square: ms of its first fill, null for a black square or one with no time. */
  fills: (number | null)[];
}

/** The inverse of encodeReplay; null for anything malformed. Mirrored in api/replay.ts. */
export function decodeReplay(code: string): DecodedReplay | null {
  if (!/^[A-Za-z0-9_-]{4,2000}$/.test(code)) return null;
  let bytes: Uint8Array;
  try {
    const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
    bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
  let at = 0;
  const byte = () => (at < bytes.length ? bytes[at++] : -1);
  const varint = () => {
    let v = 0;
    let scale = 1;
    for (let i = 0; i < 5; i++) {
      const b = byte();
      if (b < 0) return -1;
      v += (b & 0x7f) * scale;
      if (!(b & 0x80)) return v;
      scale *= 128;
    }
    return -1;
  };
  if (byte() !== REPLAY_VERSION) return null;
  const width = byte();
  const height = byte();
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) return null;
  const blocks: boolean[] = [];
  const bitBytes = Math.ceil((width * height) / 8);
  const bits: number[] = [];
  for (let i = 0; i < bitBytes; i++) {
    const b = byte();
    if (b < 0) return null;
    bits.push(b);
  }
  for (let i = 0; i < width * height; i++) blocks.push(!!(bits[i >> 3] & (1 << (i & 7))));
  const seconds = varint();
  if (seconds < 0 || seconds > MAX_SECONDS) return null;
  const fills: (number | null)[] = [];
  for (let i = 0; i < width * height; i++) {
    if (blocks[i]) {
      fills.push(null);
      continue;
    }
    const v = varint();
    if (v < 0) return null;
    fills.push(v === 0 ? null : (v - 1) * 100);
  }
  if (at !== bytes.length) return null;
  return { width, height, blocks, seconds, fills };
}
