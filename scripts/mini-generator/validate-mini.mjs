// Validate authored themed minis against the ENABLE (public-domain) word list.
// Usage: node validate-mini.mjs minis.json
import { readFileSync } from "node:fs";

import { fileURLToPath } from "node:url";
const SP = fileURLToPath(new URL("./wordlists", import.meta.url));
const WORDS = new Set(
  readFileSync(`${SP}/enable1.txt`, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter(Boolean),
);
// A few very common words ENABLE omits (it drops some 2-letter words / proper-ish).
const EXTRA = new Set(["ok", "id", "tv", "pi"]);
const isWord = (w) => WORDS.has(w.toLowerCase()) || EXTRA.has(w.toLowerCase());

function entries(grid) {
  const H = grid.length, W = grid[0].length;
  const out = [];
  // across
  for (let r = 0; r < H; r++) {
    let c = 0;
    while (c < W) {
      if (grid[r][c] === "#") { c++; continue; }
      let s = c, word = "";
      while (c < W && grid[r][c] !== "#") { word += grid[r][c]; c++; }
      out.push({ dir: "A", r, c: s, word });
    }
  }
  // down
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

function validateMini(m, i) {
  const errs = [];
  const grid = m.grid;
  if (!Array.isArray(grid) || grid.length !== 5 || grid.some((r) => r.length !== 5))
    errs.push("grid must be 5x5");
  if (!m.theme) errs.push("missing theme");
  const ents = entries(grid);
  // every white cell must be in an across run >=2 AND a down run >=2
  const acrossCover = new Set(), downCover = new Set();
  for (const e of ents) {
    if (e.word.length < 2) continue;
    for (let k = 0; k < e.word.length; k++) {
      const key = e.dir === "A" ? `${e.r},${e.c + k}` : `${e.r + k},${e.c}`;
      (e.dir === "A" ? acrossCover : downCover).add(key);
    }
  }
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    if (grid[r][c] === "#") continue;
    if (!acrossCover.has(`${r},${c}`)) errs.push(`cell ${r},${c} unchecked across`);
    if (!downCover.has(`${r},${c}`)) errs.push(`cell ${r},${c} unchecked down`);
  }
  // each entry (len>=2) is a real word + has a clue
  let themeHit = false;
  for (const e of ents) {
    if (e.word.length < 2) continue;
    if (!isWord(e.word)) errs.push(`NOT A WORD: ${e.dir} "${e.word}" @${e.r},${e.c}`);
    if (m.clueTexts[e.word.toUpperCase()] === undefined) errs.push(`no clue for ${e.word.toUpperCase()}`);
  }
  // no answer appears twice (builder keys clues by answer)
  const seen = new Map();
  for (const e of ents) if (e.word.length >= 2) seen.set(e.word, (seen.get(e.word) || 0) + 1);
  for (const [w, n] of seen) if (n > 1) errs.push(`duplicate answer "${w}" (x${n}) — builder keys clues by answer`);

  const ans = ents.filter((e) => e.word.length >= 2).map((e) => e.word.toUpperCase());
  themeHit = ans.length > 0;
  return { i, title: m.title, theme: m.theme, ok: errs.length === 0, errs, entries: ans };
}

const minis = JSON.parse(readFileSync(process.argv[2], "utf8"));
let pass = 0;
for (let i = 0; i < minis.length; i++) {
  const r = validateMini(minis[i], i);
  if (r.ok) { pass++; console.log(`✓ [${i}] "${r.title}" (${r.theme}) — ${r.entries.join(", ")}`); }
  else { console.log(`✗ [${i}] "${r.title}" (${r.theme})`); r.errs.forEach((e) => console.log(`    - ${e}`)); }
}
console.log(`\n${pass}/${minis.length} valid`);
