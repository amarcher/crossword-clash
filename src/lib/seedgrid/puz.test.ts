import { describe, expect, it } from "vitest";
import { parse } from "@xwordly/xword-parser";
import { gridFromRows } from "./grid";
import { toTransferPuzzle } from "./ipuz";
import { latin1, puzChecksum, puzClueOrder, toPuz } from "./puz";
import { normalizePuzzle, normalizeTransferPuzzle } from "../puzzleNormalizer";

const grid = gridFromRows(["CAT", "ORE", "WED"]);
const clues = {
  "1A": { standard: "Tabby", speed: "Pet that meows" },
  "4A": { standard: "Mined rock" },
  "5A": { standard: "Tied the knot" },
  "1D": { standard: "Dairy animal" },
  "2D": { standard: "Exist" },
  "3D": { standard: "Talk series" },
};

describe("toPuz", () => {
  it("writes a file the importer's parser reads back as the same puzzle", () => {
    const bytes = toPuz(grid, clues, { title: "Farm", author: "archer", notes: "A tiny one." });
    const back = normalizePuzzle(parse(bytes, { filename: "farm.puz" }), "farm.puz");
    const expected = normalizeTransferPuzzle(toTransferPuzzle(grid, clues, { title: "Farm", author: "archer" }));
    expect(back.title).toBe("Farm");
    expect(back.author).toBe("archer");
    expect(back.width).toBe(3);
    expect(back.height).toBe(3);
    expect(back.cells.map((row) => row.map((c) => c.solution))).toEqual(expected.cells.map((row) => row.map((c) => c.solution)));
    expect(back.clues.map((c) => [c.direction, c.number, c.text, c.answer])).toEqual(expected.clues.map((c) => [c.direction, c.number, c.text, c.answer]));
  });

  it("lays the header out as Across Lite 1.3 with consistent checksums", () => {
    const bytes = toPuz(grid, clues, { title: "Farm", author: "archer" });
    const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
    expect(text(0x02, 0x0e)).toBe("ACROSS&DOWN\0");
    expect(text(0x18, 0x1c)).toBe("1.3\0");
    expect(bytes[0x2c]).toBe(3);
    expect(bytes[0x2d]).toBe(3);
    expect(bytes[0x2e] | (bytes[0x2f] << 8)).toBe(6);
    // The CIB checksum covers width..scrambled tag; the overall one starts from it.
    const cib = puzChecksum(bytes.subarray(0x2c, 0x34));
    expect(bytes[0x0e] | (bytes[0x0f] << 8)).toBe(cib);
    // Masked checksums: "ICHEATED" XORed with the low then high bytes of CIB, solution, grid, text.
    expect(bytes[0x10] ^ "I".charCodeAt(0)).toBe(cib & 0xff);
    expect(bytes[0x14] ^ "A".charCodeAt(0)).toBe((cib >>> 8) & 0xff);
    expect(text(0x34, 0x34 + 9)).toBe("CATOREWED");
    expect(text(0x34 + 9, 0x34 + 18)).toBe("---------");
    expect(text(0x34 + 18, bytes.length)).toBe("Farm\0archer\0\0Tabby\0Dairy animal\0Exist\0Talk series\0Mined rock\0Tied the knot\0\0");
  });

  it("orders clues by number, across before down, and clues an unclued slot with its answer", () => {
    expect(puzClueOrder(grid, clues)).toEqual(["Tabby", "Dairy animal", "Exist", "Talk series", "Mined rock", "Tied the knot"]);
    expect(puzClueOrder(grid, { "1A": { standard: "Tabby" } })).toEqual(["Tabby", "COW", "ARE", "TED", "ORE", "WED"]);
  });

  it("writes blocks as '.' and keeps a block out of the player grid", () => {
    const blocked = gridFromRows(["CAT", "O#E", "WED"]);
    const bytes = toPuz(blocked, {}, { title: "", author: "" });
    const text = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
    expect(text(0x34, 0x34 + 9)).toBe("CATO.EWED");
    expect(text(0x34 + 9, 0x34 + 18)).toBe("----.----");
  });

  it("encodes as ISO-8859-1 and replaces what the encoding cannot hold", () => {
    expect([...latin1("café")]).toEqual([99, 97, 102, 233]);
    expect([...latin1("a€")]).toEqual([97, 63]);
  });

  it("checksums with the rotate-right-and-add the format specifies", () => {
    expect(puzChecksum(new Uint8Array([]))).toBe(0);
    expect(puzChecksum(new Uint8Array([1]))).toBe(1);
    expect(puzChecksum(new Uint8Array([1, 1]))).toBe(0x8001);
  });
});
