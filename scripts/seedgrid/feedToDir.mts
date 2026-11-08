/**
 * Unpack a published feed puzzle into a puzzle folder the editing CLIs
 * (refix, reclue, timely) read: puzzle.ipuz + session.json with the named
 * theme entries locked. For a daily whose build folder is not on this machine.
 *
 *   pnpm seedgrid:feed-dir <slot> <day> <outDir> [--seeds "CHOCOLATE, SPRINKLES"] [--difficulty easy]
 *
 * Publish the edited folder back with `pnpm daily:add --slot <slot> <day> <outDir>/puzzle.ipuz "<theme>"`.
 */
import fs from "node:fs";
import path from "node:path";
import { gridFromRows, slotsOf } from "../../src/lib/seedgrid/grid";
import { toIpuz, type ClueSet } from "../../src/lib/seedgrid/ipuz";
import { stripClueNumber } from "../../src/lib/seedgrid/crosscheck";
import { normalizeEntry } from "../../src/lib/seedgrid/dictionary";
import { publicDir } from "./feedHistory.mts";
import { parseArgs } from "./puzzleDir.mts";

const { flags, positional } = parseArgs(process.argv.slice(2));
const [slot, day, out] = positional;
if (!slot || !day || !out) {
  console.error('Usage: pnpm seedgrid:feed-dir <mini|midi|large> <YYYY-MM-DD> <outDir> [--seeds "A, B"] [--difficulty easy]');
  process.exit(1);
}
const file = path.join(publicDir, "daily-puzzles", slot === "mini" ? "" : slot, `${day}.json`);
const entry = JSON.parse(fs.readFileSync(file, "utf8"));
const p = entry.puzzle;
const cols = p.size.cols;
const rows = Array.from({ length: p.size.rows }, (_, r) => p.grid.slice(r * cols, (r + 1) * cols).map((c: string) => (c === "." ? "#" : c)).join(""));
const grid = gridFromRows(rows);
const slots = slotsOf(grid);
const clues: Record<string, ClueSet> = {};
for (const dir of ["across", "down"] as const) {
  for (const raw of p.clues[dir] as string[]) {
    const n = Number(raw.match(/^(\d+)\./)?.[1]);
    const s = slots.find((x) => x.dir === dir && x.number === n);
    if (s) clues[s.id] = { standard: stripClueNumber(raw) };
  }
}
const seeds = String(flags.seeds ?? "").split(",").map(normalizeEntry).filter(Boolean);
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "puzzle.ipuz"), JSON.stringify(toIpuz(grid, clues, { title: p.title, author: p.author, theme: entry.theme }), null, 2) + "\n");
fs.writeFileSync(
  path.join(out, "session.json"),
  JSON.stringify({ theme: entry.theme, title: p.title, seeds, symmetry: "rotational", difficulty: flags.difficulty ?? "easy" }, null, 2) + "\n",
);
console.log(`${file} → ${out} (${slots.length} entries, seeds: ${seeds.join(", ") || "none"})`);
