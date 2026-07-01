// Audit gate: rejects weak grids/clues before they ship. Run AFTER
// validate-mini.mjs (which checks real-words / coverage / clue presence).
//
//   node audit-mini.mjs minis.json [--max-rank N]
//
// Input: JSON array of {title, theme, grid, clueTexts, whitelist?} — same
// format as validate-mini.mjs, plus an optional `whitelist` array of answers
// exempt from the frequency check (the theme entry is always exempt).
//
// Per puzzle it checks:
//  - entry quality: every answer within the top --max-rank (default 30000) of
//    the frequency list (obscure crosswordese → reject), and not on the small
//    junk blocklist (subtitle-corpus artifacts that rank deceptively high)
//  - no duplicate answers (the app keys clues by answer)
//  - clue quality: clue exists, is >= 3 chars, does not contain its answer
//    (case-insensitive), no duplicate clue texts
//  - grid quality: square N×N, black squares < 20%, 180° rotational symmetry,
//    all entries >= 3 letters for 7×7+ (2-letter entries allowed only on 5×5),
//    white cells fully connected
// Reports per-puzzle pass/fail with reasons; exits 1 if any puzzle fails.
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";
const SP = fileURLToPath(new URL("./wordlists", import.meta.url));

// ---- CLI ----
const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { flags[argv[i].slice(2)] = argv[i + 1]; i++; }
  else positional.push(argv[i]);
}
const MAX_RANK = Number(flags["max-rank"] || 30000);

// ---- Frequency ranks (1-based; missing = Infinity) ----
const RANK = new Map();
readFileSync(`${SP}/freq50k.txt`, "utf8").split("\n").forEach((w, i) => {
  const t = w.trim().toLowerCase();
  if (t && !RANK.has(t)) RANK.set(t, i + 1);
});
const rankOf = (w) => RANK.get(w.toLowerCase()) ?? Infinity;

// Subtitle-corpus artifacts: names/dialect that rank high in the frequency
// list but are junk fill in a crossword. Extend as new ones slip through.
const JUNK = new Set([
  // dialect / archaic
  "ain", "tae", "rin", "naw", "hae", "dae", "yer", "oot", "ye", "da", "ne",
  "thy", "cor", "sen", "sri", "tel", "dah", "cee", "ami", "dag", "kat", "reg",
  "wanna", "gonna", "gotta", "outta", "kinda", "sorta",
  // names that sneak into ENABLE as obscure common nouns
  "ava", "raj", "taj", "dee", "del", "pam", "mel", "lin", "mae", "lex",
  "hun", "dos", "sal", "las", "sha", "sim", "dex", "nan",
  // interjections
  "aah", "umm", "heh", "yeh", "wha", "rah", "yip",
  // family-friendly fill only
  "ass", "arse", "dui", "scum", "scumbag",
]);

function entries(grid) {
  const H = grid.length, W = grid[0].length;
  const out = [];
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < W) {
      if (grid[r][c] === "#") { c++; continue; }
      let s = c, word = "";
      while (c < W && grid[r][c] !== "#") { word += grid[r][c]; c++; }
      out.push({ dir: "A", r, c: s, word });
    }
  }
  for (let c = 0; c < W; c++) {
    let r = 0;
    while (r < H) {
      if (grid[r][c] === "#") { r++; continue; }
      let s = r, word = "";
      while (r < H && grid[r][c] !== "#") { word += grid[r][c]; r++; }
      out.push({ dir: "D", r: s, c, word });
    }
  }
  return out;
}

function auditMini(m, i) {
  const errs = [];
  const grid = m.grid;
  const N = Array.isArray(grid) ? grid.length : 0;
  if (!Array.isArray(grid) || N < 2 || grid.some((r) => typeof r !== "string" || r.length !== N)) {
    return { i, title: m.title, theme: m.theme, ok: false, errs: ["grid must be a square N×N array of strings"] };
  }

  // ---- grid quality ----
  let blacks = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (grid[r][c] === "#") {
      blacks++;
      if (grid[N - 1 - r][N - 1 - c] !== "#") errs.push(`black at ${r},${c} breaks 180° symmetry`);
    }
  }
  if (blacks / (N * N) >= 0.2) errs.push(`too many blacks: ${blacks}/${N * N} (>= 20%)`);
  // connectivity of white cells (BFS)
  let start = null, whites = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (grid[r][c] !== "#") { whites++; if (!start) start = [r, c]; }
  if (whites === 0) errs.push("no white cells");
  else {
    const seen = new Set([start.join(",")]);
    const q = [start];
    while (q.length) {
      const [r, c] = q.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
        if (nr >= 0 && nr < N && nc >= 0 && nc < N && grid[nr][nc] !== "#" && !seen.has(k)) { seen.add(k); q.push([nr, nc]); }
      }
    }
    if (seen.size !== whites) errs.push(`white cells not fully connected (${seen.size}/${whites} reachable)`);
  }

  const minLen = N >= 7 ? 3 : 2;
  const rawEnts = entries(grid);
  for (const e of rawEnts) {
    if (e.word.length < minLen) errs.push(`entry "${e.word}" @${e.r},${e.c} shorter than ${minLen} (${N}×${N} grid)`);
  }
  const ents = rawEnts.filter((e) => e.word.length >= 2);

  // ---- entry quality: frequency rank + junk blocklist ----
  const theme = String(m.theme || "").toLowerCase();
  const whitelist = new Set([theme, ...(m.whitelist || []).map((w) => String(w).toLowerCase())]);
  for (const e of ents) {
    const w = e.word.toLowerCase();
    if (whitelist.has(w)) continue;
    const rank = rankOf(w);
    if (rank > MAX_RANK)
      errs.push(`obscure entry "${e.word.toUpperCase()}" (freq rank ${rank === Infinity ? "not in top 50k" : rank} > ${MAX_RANK}) — whitelist it or refill`);
    if (JUNK.has(w)) errs.push(`junk fill "${e.word.toUpperCase()}" (blocklisted subtitle-corpus artifact)`);
  }

  // ---- duplicate answers ----
  const seenAns = new Map();
  for (const e of ents) seenAns.set(e.word, (seenAns.get(e.word) || 0) + 1);
  for (const [w, n] of seenAns) if (n > 1) errs.push(`duplicate answer "${w}" (x${n})`);

  // ---- clue quality ----
  const clueTexts = m.clueTexts || {};
  const seenClues = new Map();
  for (const e of ents) {
    const ans = e.word.toUpperCase();
    const clue = clueTexts[ans];
    if (clue === undefined || clue === "") { errs.push(`no clue for ${ans}`); continue; }
    if (String(clue).length < 3) errs.push(`clue for ${ans} too short: "${clue}"`);
    if (String(clue).toLowerCase().includes(ans.toLowerCase()))
      errs.push(`clue for ${ans} contains its answer: "${clue}"`);
    const key = String(clue).toLowerCase();
    if (seenClues.has(key)) errs.push(`duplicate clue text "${clue}" (${seenClues.get(key)} and ${ans})`);
    else seenClues.set(key, ans);
  }

  return { i, title: m.title, theme: m.theme, ok: errs.length === 0, errs };
}

const minis = JSON.parse(readFileSync(positional[0], "utf8"));
let pass = 0;
for (let i = 0; i < minis.length; i++) {
  const r = auditMini(minis[i], i);
  if (r.ok) { pass++; console.log(`PASS [${i}] "${r.title}" (${r.theme})`); }
  else { console.log(`FAIL [${i}] "${r.title}" (${r.theme})`); r.errs.forEach((e) => console.log(`    - ${e}`)); }
}
console.log(`\n${pass}/${minis.length} pass the audit`);
if (pass !== minis.length) process.exit(1);
