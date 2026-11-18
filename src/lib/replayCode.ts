/**
 * The replay code a shared daily link carries (`?r=…`): enough to draw the
 * solve as it happened, and nothing that gives the puzzle away. It holds the
 * grid's shape and a timeline of what each square showed (empty, a right
 * letter, a wrong one, a letter Autocheck refused) and which clue the solver
 * was on; never a letter. `api/replay.ts` turns it into the short MP4 a link
 * preview plays (and that the completion screen shows the sender first);
 * `api/share.ts` points the link's `og:video` at it.
 *
 * Version 2 bytes, then base64url without padding:
 *   [2][width][height][black-square bitset, row-major, ceil(w*h/8) bytes][varint: total seconds]
 *   [varint: the time step, in deciseconds: about a hundredth of the solve, finer than a frame of the clip]
 *   then events in time order, each two varints:
 *     (time steps since the previous event << 3) | kind
 *     zigzag(square index − the previous event's square)
 *   kinds: 0 emptied · 1 right letter · 2 wrong letter · 3 refused (a red flash) ·
 *          4 now on the Across clue starting here · 5 the Down clue starting here
 *
 * Pure and unit-tested in replayCode.test.ts; the decoder is mirrored in
 * api/replay.ts (api/ can't import src/), and api/replay.test.ts checks they agree.
 */
import type { PuzzleCell } from "../types/puzzle";
import type { ReplayMark, TraceEvent } from "./race";

export const REPLAY_VERSION = 2;
const MAX_SIDE = 25;
const MAX_SECONDS = 36_000;

export const REPLAY_KIND = { emptied: 0, right: 1, wrong: 2, refused: 3, across: 4, down: 5 } as const;
export type ReplayKind = (typeof REPLAY_KIND)[keyof typeof REPLAY_KIND];

export interface ReplayEvent {
  ms: number;
  cell: number;
  kind: ReplayKind;
}

function pushVarint(out: number[], n: number): void {
  let v = Math.max(0, Math.floor(n));
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
}

const zigzag = (n: number) => (n >= 0 ? n * 2 : -n * 2 - 1);
const unzigzag = (n: number) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

function toBase64Url(bytes: number[]): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The parts of a puzzle a replay reads: its size, its black squares and (to judge letters) its answers. */
type ReplayGrid = { width: number; height: number; cells: readonly (readonly Pick<PuzzleCell, "solution">[])[] };

/**
 * The timeline of a finished solve: each letter written judged right or
 * wrong against the answer (the letter itself is dropped), each erase, each
 * refusal and each change of clue, in time order.
 */
export function replayEvents(puzzle: ReplayGrid, events: readonly TraceEvent[], marks: readonly ReplayMark[] = []): ReplayEvent[] {
  const w = puzzle.width;
  const answer = (cell: number) => puzzle.cells[Math.floor(cell / w)]?.[cell % w]?.solution ?? null;
  const out: ReplayEvent[] = [];
  for (const [ms, cell, letter] of events) {
    if (answer(cell) === null) continue;
    const kind =
      letter === "" || letter === 0
        ? REPLAY_KIND.emptied
        : typeof letter === "string" && letter.toUpperCase() !== (answer(cell) ?? "").toUpperCase()
          ? REPLAY_KIND.wrong
          : REPLAY_KIND.right;
    out.push({ ms, cell, kind });
  }
  for (const [ms, cell, mark] of marks) {
    out.push({ ms, cell, kind: mark === "r" ? REPLAY_KIND.refused : mark === "a" ? REPLAY_KIND.across : REPLAY_KIND.down });
  }
  // Stable by time: a clue change logged in the same instant as a letter stays before it.
  return out.map((e, i) => ({ e, i })).sort((a, b) => a.e.ms - b.e.ms || a.i - b.i).map(({ e }) => e);
}

/** The code for a finished solve, or null when the puzzle is too large or the time unusable. */
export function encodeReplay(puzzle: ReplayGrid, events: readonly TraceEvent[], seconds: number, marks: readonly ReplayMark[] = []): string | null {
  const { width: w, height: h } = puzzle;
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || !Number.isFinite(seconds) || seconds < 0) return null;
  const bytes: number[] = [REPLAY_VERSION, w, h];
  const bits = new Array<number>(Math.ceil((w * h) / 8)).fill(0);
  for (let i = 0; i < w * h; i++) if (puzzle.cells[Math.floor(i / w)]?.[i % w]?.solution === null) bits[i >> 3] |= 1 << (i & 7);
  bytes.push(...bits);
  const total = Math.min(MAX_SECONDS, Math.floor(seconds));
  pushVarint(bytes, total);
  // The clip plays the whole solve in 4.5 s, so a step of ~1/100 of it is finer than a frame.
  const step = Math.max(1, Math.round(total / 10));
  pushVarint(bytes, step);
  const lastStep = Math.floor((total * 10 + 10) / step);
  // A clue change superseded by another in the same step can't be seen: keep the last.
  const timeline = replayEvents(puzzle, events, marks).filter((e) => e.cell >= 0 && e.cell < w * h);
  const kept = timeline.filter((e, i) => {
    if (e.kind < REPLAY_KIND.across) return true;
    const next = timeline.slice(i + 1).find((n) => n.kind >= REPLAY_KIND.across);
    return !next || Math.round(next.ms / 100 / step) !== Math.round(e.ms / 100 / step);
  });
  let lastAt = 0;
  let lastCell = 0;
  for (const e of kept) {
    const at = Math.min(lastStep, Math.max(lastAt, Math.round(e.ms / 100 / step)));
    pushVarint(bytes, ((at - lastAt) << 3) | e.kind);
    pushVarint(bytes, zigzag(e.cell - lastCell));
    lastAt = at;
    lastCell = e.cell;
  }
  return toBase64Url(bytes);
}

export interface DecodedReplay {
  width: number;
  height: number;
  /** Per square, row-major: true for a black square. */
  blocks: boolean[];
  seconds: number;
  events: ReplayEvent[];
}

/** The inverse of encodeReplay; null for anything malformed. Mirrored in api/replay.ts. */
export function decodeReplay(code: string): DecodedReplay | null {
  if (!/^[A-Za-z0-9_-]{4,3000}$/.test(code)) return null;
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
  const version = byte();
  if (version !== 2) return null;
  const width = byte();
  const height = byte();
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) return null;
  const bits: number[] = [];
  for (let i = 0; i < Math.ceil((width * height) / 8); i++) {
    const b = byte();
    if (b < 0) return null;
    bits.push(b);
  }
  const blocks: boolean[] = [];
  for (let i = 0; i < width * height; i++) blocks.push(!!(bits[i >> 3] & (1 << (i & 7))));
  const seconds = varint();
  if (seconds < 0 || seconds > MAX_SECONDS) return null;
  const step = varint();
  if (step < 1 || step > MAX_SECONDS) return null;
  const events: ReplayEvent[] = [];
  let tick = 0;
  let cell = 0;
  while (at < bytes.length) {
    const head = varint();
    const delta = varint();
    if (head < 0 || delta < 0) return null;
    const kind = head & 7;
    if (kind > 5) return null;
    tick += head >> 3;
    cell += unzigzag(delta);
    if (cell < 0 || cell >= width * height || tick * step > seconds * 10 + 10 + step) return null;
    events.push({ ms: tick * step * 100, cell, kind: kind as ReplayKind });
  }
  if (at !== bytes.length) return null;
  return { width, height, blocks, seconds, events };
}

// --- A shared-grid race (version 3) ---

/**
 * A room's race on one grid (Compete, Co-op) as a code: each square and when
 * it was claimed, by which player, and the players' colours; never a letter
 * or a name. `api/replay.ts` draws it as the grid filling in each claimant's
 * colour beside a score bar per player.
 *
 *   [3][width][height][black-square bitset][varint: total seconds][varint: time step, deciseconds]
 *   [player count, 1–8][3 bytes RGB per player]
 *   then claims in time order, each two varints:
 *     (time steps since the previous claim << 3) | player index
 *     zigzag(square index − the previous claim's square)
 */
export const RACE_REPLAY_VERSION = 3;
export const MAX_RACE_PLAYERS = 8;

export interface RaceClaim {
  ms: number;
  cell: number;
  /** Index into the colours. */
  player: number;
}

export interface DecodedRaceReplay {
  width: number;
  height: number;
  blocks: boolean[];
  seconds: number;
  /** [r, g, b] per player. */
  colors: [number, number, number][];
  claims: RaceClaim[];
}

function rgbOf(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The code for a finished shared-grid race, or null when it cannot be told (too large, a colour that is not #rrggbb, no claims). */
export function encodeRaceReplay(puzzle: ReplayGrid, claims: readonly RaceClaim[], seconds: number, colors: readonly string[]): string | null {
  const { width: w, height: h } = puzzle;
  if (w < 1 || h < 1 || w > MAX_SIDE || h > MAX_SIDE || !Number.isFinite(seconds) || seconds < 0) return null;
  if (colors.length < 1 || colors.length > MAX_RACE_PLAYERS || claims.length === 0) return null;
  const rgb = colors.map(rgbOf);
  if (rgb.some((c) => c === null)) return null;
  const bytes: number[] = [RACE_REPLAY_VERSION, w, h];
  const bits = new Array<number>(Math.ceil((w * h) / 8)).fill(0);
  for (let i = 0; i < w * h; i++) if (puzzle.cells[Math.floor(i / w)]?.[i % w]?.solution === null) bits[i >> 3] |= 1 << (i & 7);
  bytes.push(...bits);
  const total = Math.min(MAX_SECONDS, Math.floor(seconds));
  pushVarint(bytes, total);
  const step = Math.max(1, Math.round(total / 10));
  pushVarint(bytes, step);
  bytes.push(rgb.length);
  for (const c of rgb) bytes.push(...(c as [number, number, number]));
  const lastStep = Math.floor((total * 10 + 10) / step);
  const ordered = claims
    .filter((c) => c.cell >= 0 && c.cell < w * h && c.player >= 0 && c.player < rgb.length)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.ms - b.c.ms || a.i - b.i)
    .map(({ c }) => c);
  if (ordered.length === 0) return null;
  let lastAt = 0;
  let lastCell = 0;
  for (const c of ordered) {
    const at = Math.min(lastStep, Math.max(lastAt, Math.round(c.ms / 100 / step)));
    pushVarint(bytes, ((at - lastAt) << 3) | c.player);
    pushVarint(bytes, zigzag(c.cell - lastCell));
    lastAt = at;
    lastCell = c.cell;
  }
  return toBase64Url(bytes);
}

/** The inverse of encodeRaceReplay; null for anything malformed. Mirrored in api/replay.ts. */
export function decodeRaceReplay(code: string): DecodedRaceReplay | null {
  if (!/^[A-Za-z0-9_-]{4,3000}$/.test(code)) return null;
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
  if (byte() !== RACE_REPLAY_VERSION) return null;
  const width = byte();
  const height = byte();
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) return null;
  const bits: number[] = [];
  for (let i = 0; i < Math.ceil((width * height) / 8); i++) {
    const b = byte();
    if (b < 0) return null;
    bits.push(b);
  }
  const blocks: boolean[] = [];
  for (let i = 0; i < width * height; i++) blocks.push(!!(bits[i >> 3] & (1 << (i & 7))));
  const seconds = varint();
  if (seconds < 0 || seconds > MAX_SECONDS) return null;
  const step = varint();
  if (step < 1 || step > MAX_SECONDS) return null;
  const count = byte();
  if (count < 1 || count > MAX_RACE_PLAYERS) return null;
  const colors: [number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    const r = byte();
    const g = byte();
    const b = byte();
    if (b < 0) return null;
    colors.push([r, g, b]);
  }
  const claims: RaceClaim[] = [];
  let tick = 0;
  let cell = 0;
  while (at < bytes.length) {
    const head = varint();
    const delta = varint();
    if (head < 0 || delta < 0) return null;
    const player = head & 7;
    if (player >= count) return null;
    tick += head >> 3;
    cell += unzigzag(delta);
    if (cell < 0 || cell >= width * height || blocks[cell] || tick * step > seconds * 10 + 10 + step) return null;
    claims.push({ ms: tick * step * 100, cell, player });
  }
  if (claims.length === 0) return null;
  return { width, height, blocks, seconds, colors, claims };
}
