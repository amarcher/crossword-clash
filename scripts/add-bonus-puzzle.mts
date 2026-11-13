/**
 * Publishes a puzzle as the Plus bonus for one calendar day
 * (docs/plus-expansion-spec.md §1; src/lib/bonus.ts).
 *
 *   pnpm bonus:add 2026-11-20 path/to/bonus.ipuz ["Theme"]
 *
 * Accepts anything the importer does (.puz/.ipuz/.jpz/.xd). A bonus never
 * goes into public/daily-puzzles/: it is a row in `bonus_puzzles`, which only
 * Plus can read the puzzle from. With SUPABASE_URL (or VITE_SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in the environment the row is upserted directly;
 * otherwise the script writes an SQL file to apply with
 * `npx supabase db query --remote=<ref> -f <file>`. Re-running for a day
 * replaces its bonus.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse } from "@xwordly/xword-parser";
import { normalizePuzzle, normalizeTransferPuzzle, puzzleToTransferFormat } from "../src/lib/puzzleNormalizer";
import { puzzleIdentity } from "../src/lib/soloStats";
import { blocksOf } from "../src/lib/bonusShape";

const USAGE = 'Usage: pnpm bonus:add YYYY-MM-DD path/to/puzzle.(puz|ipuz|jpz|xd) ["Theme"]';

const [day, file, theme] = process.argv.slice(2);
if (!day || !file || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) {
  console.error(USAGE);
  process.exit(1);
}

const raw = parse(fs.readFileSync(file), { filename: path.basename(file) });
const transfer = puzzleToTransferFormat(normalizePuzzle(raw, path.basename(file)));
// What the app will play: the round trip it makes when the bonus is loaded.
const puzzle = normalizeTransferPuzzle(transfer);
const row = {
  day,
  title: puzzle.title.trim() || "Bonus",
  theme: theme?.trim() || null,
  author: puzzle.author?.trim() || "Crossword Clash",
  width: puzzle.width,
  height: puzzle.height,
  blocks: blocksOf(puzzle),
  identity: puzzleIdentity(puzzle),
  puzzle: transfer,
};

const base = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const label = `${day} bonus: "${row.title}" by ${row.author} (${row.width}×${row.height})`;

if (base && key) {
  const res = await fetch(`${base}/rest/v1/bonus_puzzles?on_conflict=day`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    console.error(`Upsert failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  console.log(`${label} → bonus_puzzles`);
} else {
  const lit = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);
  const sql = `INSERT INTO bonus_puzzles (day, title, theme, author, width, height, blocks, identity, puzzle)
VALUES (${lit(row.day)}, ${lit(row.title)}, ${lit(row.theme)}, ${lit(row.author)}, ${row.width}, ${row.height}, ${lit(row.blocks)}, ${lit(row.identity)}, ${lit(JSON.stringify(row.puzzle))}::jsonb)
ON CONFLICT (day) DO UPDATE SET title = EXCLUDED.title, theme = EXCLUDED.theme, author = EXCLUDED.author, width = EXCLUDED.width,
  height = EXCLUDED.height, blocks = EXCLUDED.blocks, identity = EXCLUDED.identity, puzzle = EXCLUDED.puzzle;
`;
  const out = path.join(os.tmpdir(), `bonus-${day}.sql`);
  fs.writeFileSync(out, sql);
  console.log(`${label}\nNo SUPABASE_SERVICE_ROLE_KEY here: apply it with\n  npx supabase db query --yes --remote=rdqdhawlxuclfxpsvdgs -f ${out}`);
}
