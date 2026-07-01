// Backtracking filler for the 5x5 "black-corner" mini template:
//   # X X X X
//   X X X X X
//   X X X X X
//   X X X X X
//   X X X X #
// Fills from common∩ENABLE words. Optionally seeds a theme word into a slot.
// node filler.mjs [themeWord] [seedSlot]   e.g. node filler.mjs ocean A2
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";
const SP = fileURLToPath(new URL("./wordlists", import.meta.url));
const EN = new Set(readFileSync(`${SP}/enable1.txt`, "utf8").split("\n").map((w) => w.trim().toLowerCase()));
const COMMON = readFileSync(`${SP}/freq20k.txt`, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean);
// Fill pool: the ~20k most-frequent English words that are valid ENABLE words.
const pool = [...new Set(COMMON.filter((w) => EN.has(w) && /^[a-z]+$/.test(w)))];
const poolSet = new Set(pool);
const byLen = { 4: pool.filter((w) => w.length === 4), 5: pool.filter((w) => w.length === 5) };
// O(1) prefix feasibility: set of every prefix (incl. full word) per length.
const prefixSet = { 4: new Set(), 5: new Set() };
for (const len of [4, 5]) for (const w of byLen[len]) for (let i = 2; i <= len; i++) prefixSet[len].add(w.slice(0, i));

// White cells: all except (0,0) and (4,4).
const black = new Set(["0,0", "4,4"]);
const isW = (r, c) => r >= 0 && r < 5 && c >= 0 && c < 5 && !black.has(`${r},${c}`);

// Across slots (row-major): list of [ [r,c]... ] cells.
const across = [];
for (let r = 0; r < 5; r++) {
  let c = 0;
  while (c < 5) {
    if (!isW(r, c)) { c++; continue; }
    const cells = [];
    while (c < 5 && isW(r, c)) { cells.push([r, c]); c++; }
    if (cells.length >= 2) across.push(cells);
  }
}
// Down slots keyed by "r,c" start.
const downByStart = new Map();
for (let c = 0; c < 5; c++) {
  let r = 0;
  while (r < 5) {
    if (!isW(r, c)) { r++; continue; }
    const cells = [];
    const sr = r;
    while (r < 5 && isW(r, c)) { cells.push([r, c]); r++; }
    if (cells.length >= 2) downByStart.set(`${sr},${c}`, cells);
  }
}

const grid = Array.from({ length: 5 }, () => Array(5).fill(null));
for (const k of black) { const [r, c] = k.split(",").map(Number); grid[r][c] = "#"; }

// Prefix-feasibility: does some word of length L start with prefix p?
const prefixCache = new Map();
function hasWordWithPrefix(len, prefix) {
  const key = len + ":" + prefix;
  if (prefixCache.has(key)) return prefixCache.get(key);
  const ok = prefix.length === len ? poolSet.has(prefix) : prefixSet[len].has(prefix);
  prefixCache.set(key, ok);
  return ok;
}

function downPrefixOK() {
  // For every down slot, the letters placed so far must be a viable prefix.
  for (const cells of downByStart.values()) {
    let prefix = "";
    let full = true;
    for (const [r, c] of cells) {
      const ch = grid[r][c];
      if (ch === null) { full = false; break; }
      prefix += ch;
    }
    if (prefix.length >= 2) {
      if (full) { if (!poolSet.has(prefix)) return false; }
      else if (!hasWordWithPrefix(cells.length, prefix)) return false;
    }
  }
  return true;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let solution = null;
let steps = 0;
const STEP_CAP = 15000;
function solve(ai) {
  if (solution) return true;
  if (steps++ > STEP_CAP) return false; // bail this attempt; outer loop retries
  if (ai === across.length) {
    if (!downPrefixOK()) return false;
    solution = grid.map((row) => row.map((x) => (x === "#" ? "#" : x)).join(""));
    return true;
  }
  const cells = across[ai];
  const len = cells.length;
  // constraint from already-filled crossing letters
  const constraint = cells.map(([r, c]) => grid[r][c]);
  const candidates = shuffle(byLen[len].filter((w) => constraint.every((ch, k) => ch === null || ch === w[k])));
  for (const w of candidates) {
    cells.forEach(([r, c], k) => { grid[r][c] = w[k]; });
    if (downPrefixOK() && solve(ai + 1)) return true;
    cells.forEach(([r, c], k) => { grid[r][c] = constraint[k]; });
  }
  return false;
}

const themeWord = (process.argv[2] || "").toLowerCase();

function reset() { for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (!black.has(`${r},${c}`)) grid[r][c] = null; solution = null; }
function isDupFree() {
  const acr = new Set(across.map((cells) => cells.map(([r, c]) => grid[r][c]).join("")));
  for (const cells of downByStart.values()) if (acr.has(cells.map(([r, c]) => grid[r][c]).join(""))) return false;
  return true;
}
// solve() shuffles candidates, so repeated attempts explore different fills;
// retry until we get a dup-free one (across ∩ down words = ∅) or give up.
function tryWithSeed(cells) {
  const t0 = Date.now();
  for (let attempt = 0; attempt < 3000; attempt++) {
    if (Date.now() - t0 > 1200) return false; // wall-clock cap: give up this slot
    reset();
    steps = 0;
    cells.forEach(([r, c], k) => { grid[r][c] = themeWord[k]; });
    if (!downPrefixOK()) return false; // seed itself infeasible — no point retrying
    if (solve(0) && isDupFree()) return true;
  }
  return false;
}

let placedIn = "none";
if (themeWord) {
  // candidate slots (across + down) of matching length, shuffled for variety
  const slots = [
    ...across.map((cells, i) => ({ cells, name: `A${i}` })),
    ...[...downByStart.entries()].map(([k, cells]) => ({ cells, name: `D${k}` })),
  ].filter((s) => s.cells.length === themeWord.length);
  shuffle(slots);
  for (const s of slots) { if (tryWithSeed(s.cells)) { placedIn = s.name; break; } }
} else {
  solve(0);
}

if (solution) {
  console.log(JSON.stringify(solution));
  const acr = across.map((cells) => cells.map(([r, c]) => grid[r][c]).join(""));
  console.log("across:", acr.join(" "), themeWord ? `[theme "${themeWord}" @ ${placedIn}]` : "");
} else {
  console.log("NO FILL FOUND" + (themeWord ? ` for theme "${themeWord}"` : ""));
}
