/**
 * GET /api/replay?r=<code>            → the solve as a short silent MP4 (H.264, 1280×720, faststart)
 * GET /api/replay?r=<code>&poster=1   → its last frame as a JPEG (the og:image beside og:video)
 *
 * The code (src/lib/replayCode.ts) is the grid's shape and a timeline of what
 * each square showed and which clue the solver was on, never a letter, so the
 * clip shows *how* a daily was solved without giving it away: squares turn
 * blue with a right letter and red with a wrong one (a letter Autocheck
 * refused flashes red, then the square is empty again), the clue being worked
 * on is pale gold, a clock races to the finish time and a bar fills. Nothing is stored:
 * the clip is drawn from the code on request (flat colours straight into RGB
 * buffers, no canvas or fonts) and encoded by ffmpeg, and the response is
 * cached for good at the CDN (the code is the content). The completion screen
 * plays the same URL for the sender first, which also warms that cache before
 * any link preview asks.
 *
 * iMessage's animated preview is plain `og:video` → an H.264 MP4 (the recipe
 * Andrew's space-race and periodic-table use; api/share.ts writes the tags).
 *
 * Outside the Vite/tsc project like the rest of api/; Node runtime (it runs a
 * binary). vercel.json bundles the ffmpeg binary with this function.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Vercel's Node runtime provides process.env; api/ has no @types/node.
declare const process: { env: Record<string, string | undefined> };

// --- The code (mirror of decodeReplay in src/lib/replayCode.ts) ---

/** 0 emptied · 1 right letter · 2 wrong letter · 3 refused (a red flash) · 4 / 5 now on the Across / Down clue starting at this square. */
export type Kind = 0 | 1 | 2 | 3 | 4 | 5;

export interface Replay {
  width: number;
  height: number;
  blocks: boolean[];
  seconds: number;
  events: { ms: number; cell: number; kind: Kind }[];
}

const MAX_SIDE = 25;
const MAX_SECONDS = 36_000;

export function decodeReplay(code: string): Replay | null {
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
  const events: Replay["events"] = [];
  let tick = 0;
  let cell = 0;
  while (at < bytes.length) {
    const head = varint();
    const delta = varint();
    if (head < 0 || delta < 0) return null;
    const kind = head & 7;
    if (kind > 5) return null;
    tick += head >> 3;
    cell += delta % 2 === 0 ? delta / 2 : -(delta + 1) / 2;
    if (cell < 0 || cell >= width * height || tick * step > seconds * 10 + 10 + step) return null;
    events.push({ ms: tick * step * 100, cell, kind: kind as Kind });
  }
  if (at !== bytes.length) return null;
  return { width, height, blocks, seconds, events };
}

// --- Drawing ---

export const W = 1280;
export const H = 720;
export const FPS = 24;
/** The solve plays in this long whatever its length, then the finished grid holds. */
const ANIM_S = 4.5;
const HOLD_S = 1.5;
export const FRAME_COUNT = Math.round((ANIM_S + HOLD_S) * FPS);
/** How long (of the clip) a refused letter shows red before the square clears again. */
const FLASH_S = 0.35;

type Rgb = readonly [number, number, number];
const CANVAS: Rgb = [244, 246, 250]; // --color-canvas
const INK: Rgb = [20, 26, 38]; // --color-ink
const WHITE: Rgb = [255, 255, 255];
const BLUE: Rgb = [58, 107, 240]; // --color-brand-500
const RED: Rgb = [239, 68, 68]; // red-500: a wrong letter, as the share block's red squares
const CLUE: Rgb = [253, 239, 196]; // --color-gold-100: the clue being worked on, as in the game
const TRACK: Rgb = [221, 231, 255]; // --color-brand-100

function fillRect(buf: Uint8Array, x: number, y: number, w: number, h: number, [r, g, b]: Rgb): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      buf[i++] = r;
      buf[i++] = g;
      buf[i++] = b;
    }
  }
}

// Seven-segment digits: segments a b c d e f g.
const SEGMENTS: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcdfg",
};

function drawDigit(buf: Uint8Array, ch: string, x: number, y: number, dw: number, dh: number, t: number, color: Rgb): void {
  const on = SEGMENTS[ch] ?? "";
  const half = dh / 2;
  const seg: Record<string, [number, number, number, number]> = {
    a: [x + t, y, dw - 2 * t, t],
    b: [x + dw - t, y + t, t, half - 1.5 * t],
    c: [x + dw - t, y + half + 0.5 * t, t, half - 1.5 * t],
    d: [x + t, y + dh - t, dw - 2 * t, t],
    e: [x, y + half + 0.5 * t, t, half - 1.5 * t],
    f: [x, y + t, t, half - 1.5 * t],
    g: [x + t, y + half - t / 2, dw - 2 * t, t],
  };
  for (const s of on) fillRect(buf, ...seg[s], color);
}

/** "m:ss", or "mm:ss" from ten minutes. */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

interface Layout {
  cell: number;
  gap: number;
  x0: number;
  y0: number;
}

function layoutFor(replay: Replay): Layout {
  const side = Math.max(replay.width, replay.height);
  const gap = side > 11 ? 3 : 4;
  const box = 600;
  const cell = Math.floor((box - gap * (side + 1)) / side);
  const gridW = cell * replay.width + gap * (replay.width + 1);
  const gridH = cell * replay.height + gap * (replay.height + 1);
  return { cell, gap, x0: 90 + Math.floor((box - gridW) / 2), y0: Math.floor((H - gridH) / 2) };
}

/** The squares of the clue that starts at `start` and runs `across` or down: to the first black square or the edge. */
function wordCells(replay: Replay, start: number, across: boolean): number[] {
  const out: number[] = [];
  const w = replay.width;
  let r = Math.floor(start / w);
  let c = start % w;
  while (r < replay.height && c < w && !replay.blocks[r * w + c]) {
    out.push(r * w + c);
    if (across) c++;
    else r++;
  }
  return out;
}

/**
 * Draws every frame into one buffer, calling `emit` with it after each (the
 * same buffer each time: copy or write it before returning). Squares are
 * white when empty, blue with a right letter, red with a wrong one (a refused
 * letter flashes red and the square clears again), and the empty squares of
 * the clue being worked on are pale gold, as the game shows them. The last
 * 1.5 s hold the finished grid. Only squares whose colour changed, the clock
 * and the bar are redrawn per frame.
 */
export async function drawFrames(replay: Replay, emit: (frame: Uint8Array, index: number) => Promise<void> | void, frames = FRAME_COUNT): Promise<void> {
  const buf = new Uint8Array(W * H * 3);
  fillRect(buf, 0, 0, W, H, CANVAS);
  const { cell, gap, x0, y0 } = layoutFor(replay);
  const gridW = cell * replay.width + gap * (replay.width + 1);
  const gridH = cell * replay.height + gap * (replay.height + 1);
  fillRect(buf, x0, y0, gridW, gridH, INK);
  const totalMs = Math.max(1, replay.seconds) * 1000;
  const white: number[] = [];
  for (let i = 0; i < replay.blocks.length; i++) if (!replay.blocks[i]) white.push(i);
  const cellX = (i: number) => x0 + gap + (i % replay.width) * (cell + gap);
  const cellY = (i: number) => y0 + gap + Math.floor(i / replay.width) * (cell + gap);
  for (const i of white) fillRect(buf, cellX(i), cellY(i), cell, cell, WHITE);
  const painted = new Map<number, string>();

  // Each square's letter state (0 empty, 1 right, 2 wrong), refusal flashes, and the clue on screen.
  const state = new Uint8Array(replay.width * replay.height);
  const flashUntil = new Map<number, number>();
  let clue = new Set<number>();
  let next = 0;
  const flashMs = (FLASH_S / ANIM_S) * totalMs;

  // Right panel: the clock above a progress bar.
  const panelX = 760;
  const panelW = 440;
  const barY = 450;

  for (let f = 0; f < frames; f++) {
    const clipS = Math.min(f / FPS, ANIM_S);
    const holding = f / FPS >= ANIM_S;
    const solveMs = holding ? Infinity : (clipS / ANIM_S) * totalMs;
    while (next < replay.events.length && replay.events[next].ms <= solveMs) {
      const e = replay.events[next++];
      if (e.kind <= 2) {
        state[e.cell] = e.kind;
        flashUntil.delete(e.cell);
      } else if (e.kind === 3) flashUntil.set(e.cell, e.ms + flashMs);
      else clue = new Set(wordCells(replay, e.cell, e.kind === 4));
    }
    let right = 0;
    for (const i of white) {
      if (state[i] === 1) right++;
      const flashing = !holding && (flashUntil.get(i) ?? -1) > solveMs;
      const color: Rgb = flashing || state[i] === 2 ? RED : state[i] === 1 ? BLUE : !holding && clue.has(i) ? CLUE : WHITE;
      const key = color.join(",");
      if (painted.get(i) !== key) {
        painted.set(i, key);
        fillRect(buf, cellX(i), cellY(i), cell, cell, color);
      }
    }

    // Clock: digits sized to fit the panel.
    const text = clockText((clipS / ANIM_S) * replay.seconds);
    const dh = 150;
    const dw = 84;
    const t = 18;
    const space = 22;
    const colonW = 30;
    const textW = [...text].reduce((w, ch) => w + (ch === ":" ? colonW : dw) + space, -space);
    let x = panelX + Math.floor((panelW - textW) / 2);
    const y = 220;
    fillRect(buf, panelX, y - 10, panelW, dh + 20, CANVAS);
    for (const ch of text) {
      if (ch === ":") {
        fillRect(buf, x + (colonW - t) / 2, y + dh * 0.28, t, t, INK);
        fillRect(buf, x + (colonW - t) / 2, y + dh * 0.66, t, t, INK);
        x += colonW + space;
      } else {
        drawDigit(buf, ch, x, y, dw, dh, t, INK);
        x += dw + space;
      }
    }

    // Progress bar: the share of squares holding their right letter.
    const share = white.length ? right / white.length : 1;
    fillRect(buf, panelX + 20, barY, panelW - 40, 22, TRACK);
    fillRect(buf, panelX + 20, barY, (panelW - 40) * share, 22, BLUE);

    await emit(buf, f);
  }
}

// --- Encoding ---

/**
 * The ffmpeg binary: FFMPEG_PATH when set, else @ffmpeg-installer's for this
 * platform (vercel.json bundles the linux-x64 one with this function). Looked
 * up on first use, so a missing binary fails a render, not the module.
 */
let ffmpegPath: Promise<string> | null = null;
function ffmpeg(): Promise<string> {
  ffmpegPath ??= process.env.FFMPEG_PATH
    ? Promise.resolve(process.env.FFMPEG_PATH)
    : import("@ffmpeg-installer/ffmpeg").then((m) => ((m as { default?: { path: string }; path?: string }).default ?? (m as { path: string })).path);
  return ffmpegPath;
}

async function run(args: string[], input: (stdin: NodeJS.WritableStream) => Promise<void>): Promise<Buffer> {
  const bin = await ffmpeg();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    proc.stdout.on("data", (d: Buffer) => out.push(d));
    proc.stderr.on("data", (d: Buffer) => (err = (err + d.toString()).slice(-2000)));
    proc.on("error", reject);
    proc.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exited ${code}: ${err}`))));
    input(proc.stdin)
      .then(() => proc.stdin.end())
      .catch(reject);
  });
}

function writeFrame(stdin: NodeJS.WritableStream, frame: Uint8Array): Promise<void> {
  return new Promise((resolve) => {
    if (stdin.write(Buffer.from(frame))) resolve();
    else stdin.once("drain", resolve);
  });
}

const RAW_IN = ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0"];

/** The clip as MP4 bytes. faststart needs a seekable output, so it goes through a temp file. */
export async function renderVideo(replay: Replay): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "replay-"));
  const file = join(dir, "replay.mp4");
  try {
    await run(
      ["-hide_banner", "-loglevel", "error", ...RAW_IN, "-an", "-c:v", "libx264", "-preset", "veryfast", "-tune", "animation", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", file],
      (stdin) => drawFrames(replay, (frame) => writeFrame(stdin, frame)),
    );
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The finished grid as a JPEG: the poster apps show when they won't play the clip. */
export async function renderPoster(replay: Replay): Promise<Buffer> {
  let last: Uint8Array | null = null;
  await drawFrames(replay, (frame, i) => {
    if (i === FRAME_COUNT - 1) last = Uint8Array.from(frame);
  });
  return run(["-hide_banner", "-loglevel", "error", ...RAW_IN, "-frames:v", "1", "-c:v", "mjpeg", "-q:v", "3", "-f", "image2pipe", "pipe:1"], (stdin) =>
    writeFrame(stdin, last!),
  );
}

// --- The endpoint ---

const FOREVER = "public, max-age=31536000, s-maxage=31536000, immutable";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const replay = decodeReplay(url.searchParams.get("r") ?? "");
  if (!replay) return new Response("Bad replay code", { status: 400, headers: { "cache-control": "public, max-age=3600" } });
  const poster = url.searchParams.get("poster") === "1";
  try {
    const body = poster ? await renderPoster(replay) : await renderVideo(replay);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": poster ? "image/jpeg" : "video/mp4",
        "content-length": String(body.length),
        "cache-control": FOREVER,
        "access-control-allow-origin": "*",
      },
    });
  } catch {
    return new Response("Couldn't render the replay", { status: 500, headers: { "cache-control": "no-store" } });
  }
}
