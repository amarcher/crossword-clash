/**
 * Across Lite `.puz` export (format version 1.3), the file every other
 * crossword app and most editors read. Pure: bytes in, bytes out.
 *
 * Layout (offsets in bytes): overall checksum (2), "ACROSS&DOWN\0" (12), CIB
 * checksum (2), masked low (4) and high (4) checksums, "1.3\0" (4), reserved
 * (2), scrambled checksum (2), reserved (12), width (1), height (1), clue
 * count (2), bitmask (2), scrambled tag (2); then the solution (width×height,
 * "." for a block), the player grid ("-" for empty), and NUL-terminated
 * strings: title, author, copyright, each clue in number order (across
 * before down for the same number), notes. Text is ISO-8859-1; a character
 * outside it becomes "?". Speed clues have no home in the format and are left
 * out; studio grids have no circles or rebus squares.
 */
import { slotsOf, slotText, type Grid } from "./grid";
import type { ClueSet, IpuzMeta } from "./ipuz";

const MAGIC = "ACROSS&DOWN\0";
const VERSION = "1.3\0";
const HEADER_LENGTH = 0x34;

/** The Across Lite checksum: a 16-bit rotate-right-and-add over the bytes. */
export function puzChecksum(bytes: Uint8Array, seed = 0): number {
  let sum = seed & 0xffff;
  for (const byte of bytes) {
    sum = sum & 1 ? ((sum >>> 1) + 0x8000) & 0xffff : sum >>> 1;
    sum = (sum + byte) & 0xffff;
  }
  return sum;
}

/** ISO-8859-1 bytes; anything the encoding cannot hold becomes "?". */
export function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f;
  }
  return out;
}

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

/** Clue text in `.puz` order: by number, across before down for the same number. */
export function puzClueOrder(grid: Grid, clues: Record<string, ClueSet>): string[] {
  return slotsOf(grid)
    .slice()
    .sort((a, b) => a.number - b.number || (a.dir === b.dir ? 0 : a.dir === "across" ? -1 : 1))
    .map((s) => clues[s.id]?.standard?.trim() || slotText(grid, s));
}

/**
 * The file. Unclued slots get their answer as the clue, as `toIpuz` does, so
 * the file always opens.
 */
export function toPuz(grid: Grid, clues: Record<string, ClueSet>, meta: Pick<IpuzMeta, "title" | "author" | "copyright" | "notes">): Uint8Array<ArrayBuffer> {
  const { width, height } = grid;
  if (width > 255 || height > 255) throw new Error("A .puz grid is at most 255 squares a side.");
  const solution = latin1(grid.cells.map((c) => (c === "#" ? "." : c || "-")).join(""));
  const player = latin1(grid.cells.map((c) => (c === "#" ? "." : "-")).join(""));
  const clueTexts = puzClueOrder(grid, clues);
  const title = meta.title.trim();
  const author = meta.author.trim();
  const copyright = (meta.copyright ?? "").trim();
  const notes = (meta.notes ?? "").trim();

  const header = new Uint8Array(HEADER_LENGTH);
  const view = new DataView(header.buffer);
  header.set(latin1(MAGIC), 0x02);
  header.set(latin1(VERSION), 0x18);
  header[0x2c] = width;
  header[0x2d] = height;
  view.setUint16(0x2e, clueTexts.length, true);
  view.setUint16(0x30, 1, true);

  // CIB: the eight bytes from width through the scrambled tag.
  const cib = puzChecksum(header.subarray(0x2c, 0x34));
  view.setUint16(0x0e, cib, true);

  // The text checksum covers title/author/copyright/notes with their NUL when non-empty, and each clue without one.
  const textChecksum = (seed: number) => {
    let sum = seed;
    for (const field of [title, author, copyright]) if (field) sum = puzChecksum(latin1(`${field}\0`), sum);
    for (const clue of clueTexts) sum = puzChecksum(latin1(clue), sum);
    if (notes) sum = puzChecksum(latin1(`${notes}\0`), sum);
    return sum;
  };
  const overall = textChecksum(puzChecksum(player, puzChecksum(solution, cib)));
  view.setUint16(0x00, overall, true);

  const solutionChecksum = puzChecksum(solution);
  const gridChecksum = puzChecksum(player);
  const partChecksum = textChecksum(0);
  // "ICHEATED", one letter XORed into each checksum byte: low bytes first, then high.
  const low = [cib, solutionChecksum, gridChecksum, partChecksum].map((c) => c & 0xff);
  const high = [cib, solutionChecksum, gridChecksum, partChecksum].map((c) => (c >>> 8) & 0xff);
  const mask = latin1("ICHEATED");
  for (let i = 0; i < 4; i++) {
    header[0x10 + i] = mask[i] ^ low[i];
    header[0x14 + i] = mask[4 + i] ^ high[i];
  }

  const strings = latin1([title, author, copyright, ...clueTexts, notes].map((s) => `${s}\0`).join(""));
  return concat([header, solution, player, strings]);
}
