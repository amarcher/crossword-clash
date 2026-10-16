/**
 * Validates docs/large-puzzle-themes.json against the 15×15 construction rules:
 *   - every entry normalizes to 3–15 letters;
 *   - under rotational symmetry, entry lengths pair up, with at most one extra
 *     odd-length entry that can sit centered on the middle row;
 *   - no two entries in a theme share a run of letters longer than MAX_SHARED
 *     (3), the same rule the fill engine applies to its own entries;
 *   - no answer repeats across themes (so the backlog stays fresh).
 * Prints a table and exits 1 if any theme fails.
 *
 *   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs scripts/seedgrid/check-themes.mts [--md docs/large-puzzle-themes.md]
 */
import fs from "node:fs";
import { normalizeEntry } from "../../src/lib/seedgrid/dictionary";
import { conflicts } from "../../src/lib/seedgrid/solver";

const SIZE = 15;
const MAX_SHARED = 3;

interface Theme {
  slug: string;
  title: string;
  concepts: [string, string];
  entries: [string, string][];
  notes?: string;
}

const file = new URL("../../docs/large-puzzle-themes.json", import.meta.url);
const data = JSON.parse(fs.readFileSync(file, "utf8")) as { themes: Theme[] };
const mdFlag = process.argv.indexOf("--md");
const mdOut = mdFlag >= 0 ? process.argv[mdFlag + 1] : null;

/** Same-length pairs plus at most one centered odd entry: the shape rotational symmetry allows. */
function pairing(lengths: number[]): { ok: boolean; pairs: number[]; center: number | null; reason?: string } {
  const counts = new Map<number, number>();
  for (const n of lengths) counts.set(n, (counts.get(n) ?? 0) + 1);
  const pairs: number[] = [];
  let center: number | null = null;
  for (const [len, count] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
    for (let i = 0; i < Math.floor(count / 2); i++) pairs.push(len);
    if (count % 2) {
      if (center !== null) return { ok: false, pairs, center, reason: `two unpaired lengths (${center} and ${len})` };
      if ((SIZE - len) % 2) return { ok: false, pairs, center: len, reason: `a ${len} cannot be centered in a ${SIZE}-wide row` };
      center = len;
    }
  }
  return { ok: true, pairs, center };
}

/** Longest run two entries share, for the report. */
function longestShared(a: string, b: string): string {
  let best = "";
  for (let i = 0; i < a.length; i++) {
    for (let j = i + best.length + 1; j <= a.length; j++) {
      const run = a.slice(i, j);
      if (b.includes(run)) best = run;
      else break;
    }
  }
  return best;
}

const seen = new Map<string, string>();
let failures = 0;
const rows: string[] = [];
for (const theme of data.themes) {
  const answers = theme.entries.map(([raw]) => normalizeEntry(raw));
  const problems: string[] = [];
  for (const [i, w] of answers.entries()) {
    if (w.length < 3 || w.length > SIZE) problems.push(`${w} is ${w.length} letters`);
    if (seen.has(w) && seen.get(w) !== theme.slug) problems.push(`${w} also in ${seen.get(w)}`);
    seen.set(w, theme.slug);
    for (const v of answers.slice(i + 1)) {
      if (conflicts(w, v, MAX_SHARED)) problems.push(`${w} / ${v} share ${longestShared(w, v) || "a containment"}`);
    }
  }
  const p = pairing(answers.map((w) => w.length));
  if (!p.ok) problems.push(p.reason!);
  if (problems.length) failures++;
  const shape = `${p.pairs.map((n) => `${n}/${n}`).join(" + ")}${p.center ? ` + ${p.center} center` : ""}`;
  rows.push(`${problems.length ? "FAIL" : " ok "}  ${theme.slug.padEnd(24)} ${shape.padEnd(26)} ${answers.map((w) => `${w}(${w.length})`).join(" ")}${problems.length ? `\n      ↳ ${problems.join("; ")}` : ""}`);
}
console.log(rows.join("\n"));
console.log(`\n${data.themes.length} themes, ${failures} failing`);

if (mdOut) {
  const lines = [
    "# Daily Large theme backlog",
    "",
    "Mashup themes for 15×15 originals. Every entry sits at the intersection of two concepts; the pun is an overlap (TOUCHDOWN + DOWN UNDER) or a double meaning (BREAK POINT). Generated from `docs/large-puzzle-themes.json` by `scripts/seedgrid/check-themes.mts`, which enforces the construction rules: lengths pair under rotational symmetry (plus one centered odd entry at most), no two entries share a letter run longer than 3, nothing repeats across themes.",
    "",
    "Build one with `pnpm seedgrid:large --theme \"<title>\" --seeds \"<entries>\"` (see CLAUDE.md), review the fill and clues in /studio, then `pnpm daily:add`.",
    "",
    "| # | Theme | Shape | Entries | Clue sketches |",
    "|---|---|---|---|---|",
  ];
  data.themes.forEach((theme, i) => {
    const answers = theme.entries.map(([raw]) => normalizeEntry(raw));
    const p = pairing(answers.map((w) => w.length));
    const shape = `${p.pairs.map((n) => `${n}/${n}`).join(" + ")}${p.center ? ` + ${p.center}` : ""}`;
    const entries = theme.entries.map(([raw]) => `${raw.toUpperCase()} (${normalizeEntry(raw).length})`).join("<br>");
    const clues = theme.entries.map(([, clue]) => clue.replace(/\|/g, "\\|")).join("<br>");
    lines.push(`| ${i + 1} | **${theme.title}**<br>${theme.concepts.join(" × ")} | ${shape} | ${entries} | ${clues} |`);
  });
  const notes = data.themes.filter((t) => t.notes).map((t) => `- **${t.title}**: ${t.notes}`);
  if (notes.length) lines.push("", "## Notes", "", ...notes);
  fs.writeFileSync(mdOut, lines.join("\n") + "\n");
  console.log(`wrote ${mdOut}`);
}
process.exit(failures ? 1 : 0);
