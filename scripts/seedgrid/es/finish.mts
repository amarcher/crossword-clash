/**
 * Spanish spike: write one puzzle of the day's set and verify it.
 *   node … scripts/seedgrid/es/finish.mts <spec.json> <out dir>
 * spec: { slot, title, theme?, rows: string[], clues: { "1A": "…" }, themers?: string[],
 *         unsure?: { WORD: "why" }, build?: string[] (notes for review.md) }
 * Writes puzzle.ipuz and review.md, then checks the grid, the clues and the
 * other puzzles already written beside it. Exits 1 when a check fails.
 *
 * Letters are compared the way the grid spells them (src/lib/gridLetters.ts:
 * accents folded, Ñ kept), which the repo's own clue checks now do too.
 * The Spanish rules (src/lib/seedgrid/wordForms.ts) read the list's forms
 * sidecar: no two entries of one root, and a budget of finite verb forms.
 * `--report` writes the files and exits 0 whatever the rules say (for a
 * puzzle kept as an example of a failure).
 */
import fs from "node:fs";
import path from "node:path";
import { gridFromRows, gridToRows, isConnected, meetsGridStandards, slotsOf, slotText } from "../../../src/lib/seedgrid/grid";
import { cluesFromIpuz, gridFromIpuz, toIpuz, type ClueSet } from "../../../src/lib/seedgrid/ipuz";
import { auditClues, CLUE_MAX } from "../../../src/lib/seedgrid/audit";
import { foldAccents, gridSpelling, gridWords } from "../../../src/lib/gridLetters";
import { conjugationBudgetFor, conjugationProblem, finiteForms, parseForms, sameRootGroups } from "../../../src/lib/seedgrid/wordForms";

const [specPath, outDir] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const grid = gridFromRows(spec.rows);
const slots = slotsOf(grid);
const { width: W, height: H } = grid;

const fold = foldAccents;
const words = gridWords;
function givesAway(clue: string, answer: string): boolean {
  const w = words(clue);
  for (let i = 0; i < w.length; i++) {
    let joined = "";
    for (let j = i; j < Math.min(w.length, i + 5); j++) {
      joined += w[j];
      if (joined === answer || (j === i && answer.length >= 4 && joined.startsWith(answer))) return true;
    }
  }
  return false;
}

const scores = new Map(
  fs.readFileSync("artifacts/seedgrid-es/wordlist/es.dict", "utf8").split("\n").filter(Boolean).map((l) => { const [w, s] = l.split(";"); return [w, Number(s)] as const; }),
);
const themers = new Set<string>(spec.themers ?? []);
const entries = slots.map((s) => ({ id: s.id, dir: s.dir, number: s.number, answer: slotText(grid, s), cells: s.cells }));
const problems: string[] = [];
const ran: string[] = [];
const check = (name: string, bad: string[]) => { ran.push(`${bad.length ? "FAIL" : "ok  "} ${name}${bad.length ? ": " + bad.join("; ") : ""}`); problems.push(...bad.map((b) => `${name}: ${b}`)); };

// Grid shape
const white = grid.cells.map((c) => c !== "#");
const runs: string[] = [];
const cover = Array.from({ length: W * H }, () => ({ a: 0, d: 0 }));
for (const e of entries) for (const c of e.cells) cover[c][e.dir === "across" ? "a" : "d"]++;
const short: string[] = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const i = r * W + c;
  if (!white[i]) continue;
  if ((c === 0 || !white[i - 1])) { let n = 0; while (c + n < W && white[i + n]) n++; if (n < 3) short.push(`across run of ${n} at r${r + 1}c${c + 1}`); runs.push("a"); }
  if ((r === 0 || !white[i - W])) { let n = 0; while (r + n < H && white[i + n * W]) n++; if (n < 3) short.push(`down run of ${n} at r${r + 1}c${c + 1}`); }
}
check("no entry under 3 letters", short);
check("every white square in one across and one down entry", cover.flatMap((v, i) => (white[i] && (v.a !== 1 || v.d !== 1) ? [`r${Math.floor(i / W) + 1}c${(i % W) + 1}`] : [])));
check("every square filled with a letter", grid.cells.flatMap((c, i) => (c === "#" || /^[A-ZÑ]$/.test(c) ? [] : [`r${Math.floor(i / W) + 1}c${(i % W) + 1}='${c}'`])));
check("rotational symmetry", white.some((w, i) => w !== white[W * H - 1 - i]) ? ["pattern is not rotationally symmetric"] : []);
check("meetsGridStandards + connected", [...(meetsGridStandards(grid) ? [] : ["meetsGridStandards false"]), ...(isConnected(grid) ? [] : ["not connected"])]);
const seen = new Map<string, string>();
const dups: string[] = [];
for (const e of entries) { if (seen.has(e.answer)) dups.push(`${e.answer} at ${seen.get(e.answer)} and ${e.id}`); seen.set(e.answer, e.id); }
check("no duplicate entries", dups);
check("title is not an entry", entries.some((e) => e.answer === gridSpelling(spec.title)) ? [spec.title] : []);
check("every entry on the list (themers excepted)", entries.filter((e) => !themers.has(e.answer) && !scores.has(e.answer)).map((e) => `${e.id} ${e.answer}`));

// Spanish rules
const forms = parseForms(fs.readFileSync("artifacts/seedgrid-es/wordlist/es.forms.tsv", "utf8"));
const lookup = (w: string) => forms.get(w);
const answers = entries.map((e) => e.answer);
const kin = sameRootGroups(answers, lookup);
check("no two entries of one root", kin.filter((g) => g.certain).map((g) => `${g.entries.join(" / ")} (${g.lemma})`));
// A noun that could also be read as a form of a verb in the grid (ARO beside ARAR): the clues decide, so it is listed, not failed.
const maybeKin = kin.filter((g) => !g.certain).map((g) => `${g.entries.join(" / ")} (${g.lemma}?)`);
ran.push(`note same root only if a noun is read as a verb: ${maybeKin.join("; ") || "none"}`);
const budget = spec.budget ?? conjugationBudgetFor(W);
const overBudget = conjugationProblem(answers, lookup, budget);
const finite = finiteForms(answers, lookup);
check(`finite verb forms within the budget of ${budget}`, overBudget ? [`${overBudget.count}: ${overBudget.forms.join(", ")}`] : []);

// Clues
const clues: Record<string, ClueSet> = {};
for (const e of entries) if (spec.clues[e.id]?.trim()) clues[e.id] = { standard: spec.clues[e.id].trim() };
check("every entry has a clue", entries.filter((e) => !clues[e.id]).map((e) => `${e.id} ${e.answer}`));
check("no clue for a slot that does not exist", Object.keys(spec.clues).filter((id) => !entries.some((e) => e.id === id)));
const clued = entries.filter((e) => clues[e.id]).map((e) => ({ slotId: e.id, answer: e.answer, clue: clues[e.id].standard }));
check(`clue length within ${CLUE_MAX}`, clued.filter((e) => e.clue.length > CLUE_MAX).map((e) => `${e.slotId} ${e.clue.length}`));
check("clue never holds its answer (five-word runs)", clued.filter((e) => givesAway(e.clue, e.answer)).map((e) => `${e.slotId} ${e.answer}: ${e.clue}`));
check("repo auditClues (length and giveaway)", auditClues(clued).filter((i) => i.severity === "block").map((i) => i.message));
const twins = new Map<string, string>();
const twinBad: string[] = [];
for (const e of clued) { const k = fold(e.clue); if (twins.has(k)) twinBad.push(`${twins.get(k)} and ${e.slotId}`); twins.set(k, e.slotId); }
check("no two entries share a clue", twinBad);

// iPUZ round trip
const ipuz = toIpuz(grid, clues, { title: spec.title, author: "Crossword Clash (borrador en español)", theme: spec.theme });
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, "puzzle.ipuz");
fs.writeFileSync(file, JSON.stringify(ipuz, null, 1) + "\n");
const back = JSON.parse(fs.readFileSync(file, "utf8"));
const backGrid = gridFromIpuz(back);
const backClues = cluesFromIpuz(back, backGrid);
check("ipuz round trip (gridFromIpuz, cluesFromIpuz)", [
  ...(gridToRows(backGrid).join("/") === gridToRows(grid).join("/") ? [] : ["grid differs"]),
  ...entries.filter((e) => (backClues[e.id]?.standard ?? "") !== (clues[e.id]?.standard ?? "")).map((e) => `${e.id} clue differs`),
]);

// The rest of the day's set
const dayDir = path.dirname(outDir);
const shared: string[] = [];
const compared: string[] = [];
for (const other of fs.readdirSync(dayDir)) {
  const p = path.join(dayDir, other, "puzzle.ipuz");
  if (other === path.basename(outDir) || !fs.existsSync(p)) continue;
  const g = gridFromIpuz(JSON.parse(fs.readFileSync(p, "utf8")));
  const theirs = new Set(slotsOf(g).map((s) => slotText(g, s)));
  compared.push(other);
  for (const e of entries) if (e.answer.length >= 4 && theirs.has(e.answer)) shared.push(`${e.answer} (also in ${other})`);
}
check(`no entry of 4+ letters shared with ${compared.join(", ") || "(no other puzzle written yet)"}`, shared);

// review.md
const score = (w: string) => (themers.has(w) && !scores.has(w) ? "theme" : String(scores.get(w) ?? "—"));
const blocks = white.filter((w) => !w).length;
const enye = entries.filter((e) => e.answer.includes("Ñ"));
const weak = entries.filter((e) => !themers.has(e.answer) && (scores.get(e.answer) ?? 0) < 52).sort((a, b) => (scores.get(a.answer) ?? 0) - (scores.get(b.answer) ?? 0));
const table = (dir: string) => entries.filter((e) => e.dir === dir).map((e) => `| ${e.number} | ${e.answer} | ${score(e.answer)} | ${clues[e.id]?.standard ?? "(missing)"} |`).join("\n");
const md = `# ${spec.title} (${spec.slot}, ${W}×${H})

Day: 2026-11-22 (Santa Cecilia, Día de la Música). ${spec.theme ?? ""}

\`\`\`
${gridToRows(grid).join("\n")}
\`\`\`

Blocks: ${blocks} of ${W * H}. Entries: ${entries.length}. ${themers.size ? `Theme entries: ${[...themers].join(", ")}.` : ""}

Entries with Ñ: ${enye.length ? enye.map((e) => `${e.id} ${e.answer}`).join(", ") : "none"}.

Weakest entries by list score (below 52): ${weak.length ? weak.map((e) => `${e.answer} ${score(e.answer)}`).join(", ") : "none"}.

Conjugated verbs (budget ${budget}): ${finite.length ? `${finite.length}: ${finite.map((w) => forms.get(w)?.spellings.join("/") ?? w).join(", ")}` : "none"}. Same-root pairs: ${kin.some((g) => g.certain) ? kin.filter((g) => g.certain).map((g) => g.entries.join(" / ")).join("; ") : "none"}${maybeKin.length ? `; to judge by the clues: ${maybeKin.join("; ")}` : ""}.

## Not sure of
${Object.entries(spec.unsure ?? {}).map(([w, why]) => `- **${w}**: ${why}`).join("\n") || "- nothing flagged"}

## Across
| # | Answer | Score | Clue |
|---|---|---|---|
${table("across")}

## Down
| # | Answer | Score | Clue |
|---|---|---|---|
${table("down")}

## How it was built
${(spec.build ?? []).map((b: string) => `- ${b}`).join("\n")}

## Checks (scripts/seedgrid/es/finish.mts)
\`\`\`
${ran.join("\n")}
\`\`\`
`;
fs.writeFileSync(path.join(outDir, "review.md"), md);
console.log(ran.join("\n"));
console.log(`${spec.slot}: ${entries.length} entries, ${blocks} blocks → ${file}`);
if (process.argv.includes("--list")) for (const e of entries) console.log(e.id, e.answer, score(e.answer));
process.exit(problems.length && !process.argv.includes("--report") ? 1 : 0);
