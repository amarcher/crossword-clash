// Backtracking filler for N×N crossword grids with symmetric black-square
// patterns (180° rotational symmetry — the crossword standard).
//
//   node filler.mjs [themeWord] [--size N] [--pool N] [--pattern P] [--time-ms N]
//
//   --size N      grid size (default 5; supports 5..15, e.g. 5, 7, 11)
//   --pool N      fill pool = top-N frequency words ∩ ENABLE (default 20000;
//                 use e.g. 30000+ for larger grids that need rarer long words)
//   --pattern P   "auto" to derive a random symmetric pattern (re-derives and
//                 retries if a pattern won't fill), or explicit rows joined by
//                 commas (e.g. "#....,.....,.....,.....,....#").
//                 Default: the built-in pattern for the size, else auto.
//   --time-ms N   wall-clock cap per fill attempt loop (default scales with
//                 size: 1200 for 5×5, 10000 for 7×7, 30000 beyond)
//
// Examples:
//   node filler.mjs ocean                 # classic 5×5 black-corner mini
//   node filler.mjs weekend --size 7      # 7×7 pinwheel, theme-seeded
//   node filler.mjs --size 11 --pool 30000 --pattern auto
//
// Fills from common∩ENABLE words with O(1) prefix feasibility, a step cap per
// attempt, and an outer retry loop until the fill is dup-free.
import { readFileSync, existsSync } from "node:fs";

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
const themeWord = (positional[0] || "").toLowerCase();
const SIZE = Number(flags.size || 5);
if (!Number.isInteger(SIZE) || SIZE < 5 || SIZE > 15) { console.error("--size must be 5..15"); process.exit(1); }
const POOL_N = Number(flags.pool || 20000);
const MIN_LEN = SIZE >= 7 ? 3 : 2; // 2-letter entries only acceptable on 5×5
const TIME_MS = Number(flags["time-ms"] || (SIZE <= 5 ? 1200 : SIZE <= 7 ? 10000 : 30000));
const STEP_CAP = SIZE <= 5 ? 15000 : SIZE <= 7 ? 60000 : 250000;
const PATTERN_TRIES = 8; // auto mode: how many fresh patterns to try before giving up

// ---- Word pool: top-POOL_N frequency words ∩ ENABLE ----
const EN = new Set(readFileSync(`${SP}/enable1.txt`, "utf8").split("\n").map((w) => w.trim().toLowerCase()));
const freqFile = existsSync(`${SP}/freq50k.txt`) ? `${SP}/freq50k.txt` : `${SP}/freq20k.txt`;
const COMMON = readFileSync(freqFile, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, POOL_N);
// Subtitle-corpus artifacts that rank deceptively high — keep in sync with audit-mini.mjs JUNK.
const JUNK = new Set([
  "ain", "tae", "rin", "naw", "ana", "hae", "dae", "yer", "oot", "ye",
  "da", "ne", "wanna", "gonna", "gotta", "outta", "kinda", "sorta",
]);
const pool = [...new Set(COMMON.filter((w) => EN.has(w) && /^[a-z]+$/.test(w) && !JUNK.has(w)))];
const poolSet = new Set(pool);

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---- Symmetric black-square patterns ----
// Built-in patterns (180° rotationally symmetric, all runs >= MIN_LEN).
const BUILTIN = {
  5: ["#....", ".....", ".....", ".....", "....#"], // classic black-corner mini
  7: ["...#...", "...#...", ".......", "##...##", ".......", "...#...", "...#..."], // pinwheel
};

const runsOK = (rows, n, minLen) => {
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; ) {
      if (rows[r][c] === "#") { c++; continue; }
      let len = 0; while (c < n && rows[r][c] !== "#") { len++; c++; }
      if (len < minLen) return false;
    }
  }
  for (let c = 0; c < n; c++) {
    for (let r = 0; r < n; ) {
      if (rows[r][c] === "#") { r++; continue; }
      let len = 0; while (r < n && rows[r][c] !== "#") { len++; r++; }
      if (len < minLen) return false;
    }
  }
  return true;
};
const isConnected = (rows, n) => {
  let start = null, whites = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (rows[r][c] !== "#") { whites++; if (!start) start = [r, c]; }
  if (!start) return false;
  const seen = new Set([start.join(",")]);
  const q = [start];
  while (q.length) {
    const [r, c] = q.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc, k = `${nr},${nc}`;
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && rows[nr][nc] !== "#" && !seen.has(k)) { seen.add(k); q.push([nr, nc]); }
    }
  }
  return seen.size === whites;
};
const isSymmetric = (rows, n) => {
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if ((rows[r][c] === "#") !== (rows[n - 1 - r][n - 1 - c] === "#")) return false;
  return true;
};

// Derive a random 180°-symmetric pattern: place symmetric black pairs, then
// keep it only if every run >= MIN_LEN, whites are connected, blacks < 20%.
// Biases toward more blacks on big grids (shorter slots fill more reliably).
function derivePattern(n, minLen) {
  const maxBlack = Math.floor(n * n * 0.2) - 1;
  for (let attempt = 0; attempt < 20000; attempt++) {
    const lo = n <= 5 ? 2 : Math.floor(maxBlack / 2);
    const target = lo + 2 * Math.floor(Math.random() * ((maxBlack - lo) / 2 + 1));
    const black = new Set();
    let guard = 0;
    while (black.size < target && guard++ < 200) {
      const r = Math.floor(Math.random() * n), c = Math.floor(Math.random() * n);
      black.add(`${r},${c}`); black.add(`${n - 1 - r},${n - 1 - c}`);
    }
    if (black.size > maxBlack) continue;
    const rows = Array.from({ length: n }, (_, r) =>
      Array.from({ length: n }, (_, c) => (black.has(`${r},${c}`) ? "#" : ".")).join(""));
    if (runsOK(rows, n, minLen) && isConnected(rows, n)) return rows;
  }
  console.error("could not derive a valid symmetric pattern"); process.exit(1);
}

// ---- Fill one pattern (returns result object or null) ----
function fillPattern(patternRows) {
  const black = new Set();
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (patternRows[r][c] === "#") black.add(`${r},${c}`);
  const isW = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && !black.has(`${r},${c}`);

  // Across slots (row-major): list of [ [r,c]... ] cells.
  const across = [];
  for (let r = 0; r < SIZE; r++) {
    let c = 0;
    while (c < SIZE) {
      if (!isW(r, c)) { c++; continue; }
      const cells = [];
      while (c < SIZE && isW(r, c)) { cells.push([r, c]); c++; }
      if (cells.length >= 2) across.push(cells);
    }
  }
  // Down slots keyed by "r,c" start.
  const downByStart = new Map();
  for (let c = 0; c < SIZE; c++) {
    let r = 0;
    while (r < SIZE) {
      if (!isW(r, c)) { r++; continue; }
      const cells = [];
      const sr = r;
      while (r < SIZE && isW(r, c)) { cells.push([r, c]); r++; }
      if (cells.length >= 2) downByStart.set(`${sr},${c}`, cells);
    }
  }

  // Per-length word lists + O(1) prefix feasibility for every slot length.
  const lengths = new Set([...across, ...downByStart.values()].map((cells) => cells.length));
  const byLen = {}, prefixSet = {};
  for (const len of lengths) {
    byLen[len] = pool.filter((w) => w.length === len);
    prefixSet[len] = new Set();
    for (const w of byLen[len]) for (let i = 2; i <= len; i++) prefixSet[len].add(w.slice(0, i));
    if (byLen[len].length === 0) { console.error(`no pool words of length ${len} — raise --pool`); return null; }
  }

  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
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

  let solution = null;
  let steps = 0;
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

  function reset() { for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!black.has(`${r},${c}`)) grid[r][c] = null; solution = null; }
  function allWords() {
    return [...across, ...downByStart.values()].map((cells) => cells.map(([r, c]) => grid[r][c]).join(""));
  }
  function isDupFree() {
    const words = allWords();
    return new Set(words).size === words.length; // no answer repeats anywhere (app keys clues by answer)
  }
  // solve() shuffles candidates, so repeated attempts explore different fills;
  // retry until we get a dup-free one or the wall-clock cap expires.
  function tryFill(seedCells) {
    const t0 = Date.now();
    for (let attempt = 0; attempt < 5000; attempt++) {
      if (Date.now() - t0 > TIME_MS) return false; // wall-clock cap
      reset();
      steps = 0;
      if (seedCells) seedCells.forEach(([r, c], k) => { grid[r][c] = themeWord[k]; });
      if (seedCells && !downPrefixOK()) return false; // seed itself infeasible — no point retrying
      if (solve(0) && isDupFree()) return true;
    }
    return false;
  }

  const result = () => ({
    solution,
    across: across.map((cells) => cells.map(([r, c]) => grid[r][c]).join("")),
    down: [...downByStart.values()].map((cells) => cells.map(([r, c]) => grid[r][c]).join("")),
  });

  if (themeWord) {
    // candidate slots (across + down) of matching length, shuffled for variety
    const slots = [
      ...across.map((cells, i) => ({ cells, name: `A${i}` })),
      ...[...downByStart.entries()].map(([k, cells]) => ({ cells, name: `D${k}` })),
    ].filter((s) => s.cells.length === themeWord.length);
    if (slots.length === 0) { console.error(`no slot of length ${themeWord.length} in this pattern`); return null; }
    shuffle(slots);
    for (const s of slots) if (tryFill(s.cells)) return { ...result(), placedIn: s.name };
    return null;
  }
  return tryFill(null) ? result() : null;
}

// ---- Main: pick pattern(s) and fill ----
if (themeWord && !poolSet.has(themeWord)) {
  console.error(`note: theme "${themeWord}" is not in the fill pool (whitelist it in the audit)`);
}

let explicit = null;
if (flags.pattern && flags.pattern !== "auto") {
  explicit = flags.pattern.split(",");
  if (explicit.length !== SIZE || explicit.some((r) => r.length !== SIZE || /[^.#]/.test(r))) {
    console.error(`--pattern must be ${SIZE} comma-separated rows of . and #`); process.exit(1);
  }
  if (!isSymmetric(explicit, SIZE)) { console.error("--pattern is not 180° rotationally symmetric"); process.exit(1); }
  if (!runsOK(explicit, SIZE, MIN_LEN)) { console.error(`--pattern has a run shorter than ${MIN_LEN}`); process.exit(1); }
  if (!isConnected(explicit, SIZE)) { console.error("--pattern white cells are not connected"); process.exit(1); }
}
const auto = flags.pattern === "auto" || (!explicit && !BUILTIN[SIZE]);

let found = null;
let patternUsed = null;
for (let t = 0; t < (auto ? PATTERN_TRIES : 1) && !found; t++) {
  patternUsed = explicit ?? (auto ? derivePattern(SIZE, MIN_LEN) : BUILTIN[SIZE]);
  found = fillPattern(patternUsed);
}

if (found) {
  console.log(JSON.stringify(found.solution));
  console.log("pattern:", JSON.stringify(patternUsed));
  console.log("across:", found.across.join(" "), themeWord ? `[theme "${themeWord}" @ ${found.placedIn}]` : "");
  console.log("down:  ", found.down.join(" "));
} else {
  console.log("NO FILL FOUND" + (themeWord ? ` for theme "${themeWord}"` : ""));
  process.exit(2);
}
