/**
 * Headless construction pipeline: theme → seed entries → skeleton → curated
 * fill → review → clues → .ipuz, after the Ingrid workflow. The grid math is
 * the deterministic engine in src/lib/seedgrid/; Claude only chooses among
 * entries the engine has proven fit, reviews the fill, and writes clues.
 *
 *   pnpm seedgrid --theme "sea creatures named for tarot cards"
 *   pnpm seedgrid --seeds "starfish,devil ray" --size 9
 *   pnpm seedgrid --size 5                      # themeless mini
 *   pnpm seedgrid --size 7 --no-llm             # grid only, no API calls
 *
 * Flags: --size N, --symmetry rotational|mirror|diagonal|none, --min-score 49|50,
 * --max-shared 3, --title, --author, --dict extra.dict (repeatable), --out DIR,
 * --model ID, --seed N (repeatable randomness).
 *
 * Writes <out>/<slug>/puzzle.ipuz (publish with `pnpm daily:add`) and
 * review.md (grid, heatmap, audit, clues, every decision Claude made).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeDicts, normalizeEntry, parseDict, WordIndex, type DictEntry } from "../../src/lib/seedgrid/dictionary";
import { gridStats, gridToRows, slotsOf, slotText, type Grid, type Symmetry } from "../../src/lib/seedgrid/grid";
import { FillEngine } from "../../src/lib/seedgrid/solver";
import { buildSkeleton, placeSeeds, shapeSkeleton, tryBlock, type Skeleton } from "../../src/lib/seedgrid/layout";
import { auditClues, auditGrid, clueBudget, type AuditReport } from "../../src/lib/seedgrid/audit";
import { clueProblems, cluesRequest, CONSTRUCTOR, type ClueRow } from "../../src/lib/seedgrid/cluePrompt";
import { toIpuz, type ClueSet } from "../../src/lib/seedgrid/ipuz";
import { callJson, DEFAULT_MODEL, usage } from "./claude.mts";

// ---- CLI ----
const argv = process.argv.slice(2);
const flags: Record<string, string[]> = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith("--")) continue;
  const key = argv[i].slice(2);
  const next = argv[i + 1];
  const value = next === undefined || next.startsWith("--") ? "true" : (i++, next);
  (flags[key] ??= []).push(value);
}
const flag = (k: string) => flags[k]?.[0];
const useLlm = !flags["no-llm"];
const theme = flag("theme") ?? "";
let symmetry = (flag("symmetry") ?? "rotational") as Symmetry;
let minScore = Number(flag("min-score") ?? 50);
const maxShared = Number(flag("max-shared") ?? 3);
const model = flag("model") ?? DEFAULT_MODEL;
let seedState = Number(flag("seed") ?? Date.now() % 2 ** 31);
const random = () => {
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const log = (...a: unknown[]) => console.log(...a);

// ---- Word lists ----
const here = path.dirname(fileURLToPath(import.meta.url));
const listFile = (name: string) => path.join(here, "wordlists", name);
// SEEDGRID_WORD_LIST=production uses only licensable sources (see build-dict.mts).
const baseList = process.env.SEEDGRID_WORD_LIST === "production" ? "production.dict" : "base.dict";
if (!fs.existsSync(listFile(baseList))) {
  console.error(`Missing scripts/seedgrid/wordlists/${baseList}. Run \`pnpm seedgrid:dict\` first.`);
  process.exit(1);
}
const loadDict = (file: string) => (fs.existsSync(file) ? parseDict(fs.readFileSync(file, "utf8")) : []);
const entries: DictEntry[] = mergeDicts(
  loadDict(listFile(baseList)),
  loadDict(listFile("lively.dict")),
  ...(flags.dict ?? []).map(loadDict),
  loadDict(listFile("rescore.dict")),
  loadDict(listFile("blocked.dict")),
);

// ---- Claude steps ----

interface SeedSet {
  title: string;
  explanation: string;
  seeds: string[];
}

async function proposeSeedSets(size: number | undefined): Promise<SeedSet[]> {
  const maxLen = size ?? 11;
  const { sets } = await callJson<{ sets: SeedSet[] }>({
    model,
    system: CONSTRUCTOR,
    prompt: `Theme idea: ${theme}

Propose 4 alternative sets of theme entries ("seeds") for a ${size ? `${size}×${size}` : "7×7 to 11×11"} grid.
- Each set is either 2 entries of the SAME length, or 3 entries where two share a length and the third has an odd length (it sits in the center row). Each entry is 5–${maxLen} letters once spaces are removed. Grids lay theme entries out symmetrically, so these length rules matter.
- Entries must be real, in-the-language words, phrases, or names, written normally ("devil ray").
- Every entry in a set must fit the theme exactly; the set should feel clever, with an aha.
- title: the puzzle's name, ideally a pun that ties the set together. explanation: one sentence.`,
    schema: {
      type: "object",
      properties: {
        sets: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, explanation: { type: "string" }, seeds: { type: "array", items: { type: "string" } } },
            required: ["title", "explanation", "seeds"],
          },
        },
      },
      required: ["sets"],
    },
  });
  return sets;
}

interface SlotDecision {
  slot: string;
  approve: string[];
  reject: { word: string; reason: string }[];
}

async function curate(grid: Grid, slots: { id: string; pattern: string; candidates: string[] }[], context: string) {
  const { decisions } = await callJson<{ decisions: SlotDecision[] }>({
    model,
    system: CONSTRUCTOR,
    prompt: `${context}
Skeleton (# = black, . = open, letters = locked theme entries):
${gridToRows(grid).join("\n")}

For each slot below, the fill engine has proven every candidate fits. Curate like Ingrid's approve/reject pass:
- Long slots: approve the 5–8 liveliest candidates (phrases and fresh vocabulary beat plain words).
- Short or tight slots: approve every clean option; skip only the weak ones.
- reject: only clearly bad fill (crosswordese, abbreviation, partial, archaic, obscure, offensive). Rejected words are banned from the whole puzzle. Do not reject a word just because others are better.
- Approve and reject only words from that slot's candidate list.

${slots.map((s) => `${s.id} (${s.pattern}): ${s.candidates.join(", ")}`).join("\n")}`,
    schema: {
      type: "object",
      properties: {
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slot: { type: "string" },
              approve: { type: "array", items: { type: "string" } },
              reject: {
                type: "array",
                items: {
                  type: "object",
                  properties: { word: { type: "string" }, reason: { type: "string", enum: ["crosswordese", "abbreviation", "partial", "archaic", "obscure", "offensive", "other"] } },
                  required: ["word", "reason"],
                },
              },
            },
            required: ["slot", "approve", "reject"],
          },
        },
      },
      required: ["decisions"],
    },
  });
  return decisions;
}

interface Review {
  verdict: "ship" | "revise";
  replace: { answer: string; reason: string; severity: "must" | "nice" }[];
  notes: string;
}

async function review(grid: Grid, report: AuditReport, context: string): Promise<Review> {
  return callJson<Review>({
    model,
    system: CONSTRUCTOR,
    prompt: `${context}
Filled grid:
${gridToRows(grid).join("\n")}

Entries (score; tags p=proper, a=abbreviation, s=slang; LOCKED = theme entry, cannot change):
${report.entries.map((e) => `${e.slotId} ${e.answer} (${e.locked ? "LOCKED" : e.score}${e.tags ? `; ${e.tags}` : ""})`).join("\n")}

Automatic checks flagged:
${report.issues.map((i) => `- [${i.severity}] ${i.message}`).join("\n") || "- nothing"}

Review this fill as an editor would before it ships to a fast multiplayer audience. List entries to replace:
- severity "must": a solver racing the clock would not know it or could not get it from crossings (obscure, crosswordese, unfair proper-noun cross), it is a duplicate, an ugly partial or abbreviation crossing an abbreviation, or it is unpleasant.
- severity "nice": acceptable but could be better.
For a pile-up, name the single entry whose removal helps most. Never list LOCKED entries. verdict "ship" if there is nothing "must".`,
    schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["ship", "revise"] },
        replace: {
          type: "array",
          items: {
            type: "object",
            properties: { answer: { type: "string" }, reason: { type: "string" }, severity: { type: "string", enum: ["must", "nice"] } },
            required: ["answer", "reason", "severity"],
          },
        },
        notes: { type: "string" },
      },
      required: ["verdict", "replace", "notes"],
    },
  });
}


async function writeClues(grid: Grid, context: string, fix?: { slot: string; problem: string }[]): Promise<ClueRow[]> {
  const req = cluesRequest(grid, context, { fix });
  const { clues } = await callJson<{ clues: ClueRow[] }>({ model, ...req, maxTokens: Math.max(req.maxTokens, 12000) });
  return clues;
}

// ---- Rendering ----
function heatmap(engine: FillEngine): string[] {
  const opts = engine.cellOptions();
  const sym = (n: number, ch: string) => (n < 0 ? "#" : ch ? ch : n === 0 ? "X" : n <= 5 ? "!" : n < 20 ? "+" : ".");
  return gridToRows(engine.grid).map((row, r) =>
    row.split("").map((ch, c) => sym(opts[r * engine.grid.width + c], ch === "." || ch === "#" ? "" : ch.toLowerCase())).join(""),
  );
}

/**
 * Breaks up dead slots the way a constructor would: drop a black square into
 * the slot with no (or the fewest) options and re-check. Null if it cannot.
 */
function repair(grid: Grid, index: WordIndex): Grid | null {
  for (let step = 0; step < 6; step++) {
    const engine = new FillEngine(grid, index, { maxShared });
    if (engine.consistentDomains()) return grid;
    const options = engine.slotOptions();
    const worst = engine.slots
      .map((s, si) => ({ s, n: engine.fixed[si] === null ? options[si] : Infinity }))
      .sort((a, b) => a.n - b.n)[0];
    if (!worst || worst.n === Infinity) return null;
    const spots = worst.s.cells.filter((i) => !grid.locked[i]).sort(() => random() - 0.5);
    const next = spots.map((i) => tryBlock(grid, i, symmetry)).find((g) => g && !gridStats(g).shortRuns);
    if (!next) return null;
    grid = next;
  }
  return null;
}

// ---- Pipeline ----
async function main() {
  const startedAt = Date.now();
  const notes: string[] = [];
  let title = flag("title") ?? "";
  let explanation = "";
  let seedSets: string[][];

  const sizeFlag = flag("size") ? Number(flag("size")) : undefined;
  if (flags.seeds) {
    seedSets = [flag("seeds")!.split(",").map(normalizeEntry).filter(Boolean)];
  } else if (theme && useLlm) {
    log(`Brainstorming seed sets for "${theme}"…`);
    const sets = await proposeSeedSets(sizeFlag);
    for (const s of sets) log(`  ${s.title}: ${s.seeds.join(", ")} — ${s.explanation}`);
    notes.push("## Seed sets proposed", ...sets.map((s) => `- **${s.title}**: ${s.seeds.join(", ")} — ${s.explanation}`), "");
    // Easiest layouts first: fewer seeds, then pairs of equal length.
    const paired = (seeds: string[]) => seeds.filter((w) => seeds.filter((o) => o.length === w.length).length >= 2).length;
    seedSets = sets
      .map((s) => s.seeds.map(normalizeEntry).filter((w) => w.length >= 3))
      .sort((a, b) => a.length - b.length || paired(b) - paired(a));
    const first = sets[0];
    title ||= first?.title ?? "";
    explanation = first?.explanation ?? "";
    // Keep set titles in step with their seeds for the one that gets used.
    (globalThis as { __sets?: SeedSet[] }).__sets = sets;
  } else {
    seedSets = [[]];
  }

  let chosen: { skeleton: Skeleton; seeds: string[]; fill: Grid } | null = null;
  const requested = minScore;
  for (const seeds of seedSets) {
    const longest = Math.max(0, ...seeds.map((s) => s.length));
    // Like a constructor, give long seeds some room: try the tight size, then a bit larger.
    const sizes = sizeFlag ? [Math.max(sizeFlag, longest)] : seeds.length ? [longest, longest + 1, longest + 2] : [5];
    // Without an explicit --symmetry, fall back to a free-form grid as Ingrid users do
    // when theme entries cannot be paired.
    const symmetries: Symmetry[] = flag("symmetry") || !seeds.length ? [symmetry] : ["rotational", "none"];
    // And, like lowering Ingrid's required score, accept less common words only if needed.
    const scores = [...new Set([requested, 47, 44].filter((n) => n <= requested))];
    for (const score of scores) {
      if (chosen) break;
      minScore = score;
      const index = new WordIndex(mergeDicts(entries, seeds.map((w) => ({ word: w, score: 100, tags: "" }))), minScore);
      for (const sym of symmetries) for (const size of sizes) {
        if (size > 15 || chosen) continue;
        symmetry = sym;
        log(`Building ${size}×${size} ${symmetry} skeletons${seeds.length ? ` around ${seeds.join(", ")}` : ""} at score ${minScore}…`);
        const probeMs = size <= 7 ? 1500 : 4000;
        // Fast random layouts first, then heatmap-guided shaping.
        for (let attempt = 0; attempt < 160 && !chosen; attempt++) {
          const placed =
            attempt < 100
              ? buildSkeleton({ size, symmetry, seeds, random, maxBlockPct: attempt < 50 ? 0.22 : 0.26 })
              : placeSeeds({ size, symmetry, seeds, random });
          const grid =
            placed &&
            (attempt < 100
              ? repair(placed.grid, index)
              : shapeSkeleton(placed.grid, index, { symmetry, maxShared, random, maxBlockPct: attempt < 130 ? 0.22 : 0.26 }));
          if (!placed || !grid) continue;
          // Keep the skeleton only if the engine can fill it unaided.
          const fill = new FillEngine(grid, index, { maxShared, random, timeMs: probeMs }).fill();
          if (fill) chosen = { skeleton: { ...placed, grid }, seeds, fill };
        }
      }
    }
    if (chosen) {
      if (minScore < requested) notes.push(`Required score lowered from ${requested} to ${minScore} to fit this skeleton.`, "");
      const sets = (globalThis as { __sets?: SeedSet[] }).__sets;
      const set = sets?.find((s) => s.seeds.map(normalizeEntry).join() === seeds.join());
      if (set && !flag("title")) {
        title = set.title;
        explanation = set.explanation;
      }
      break;
    }
    minScore = requested;
    log("  no fillable skeleton; trying the next set");
  }
  if (!chosen) {
    console.error("Could not build a fillable grid. Try a larger --size, --symmetry none, --min-score 49, or other seeds.");
    process.exit(1);
  }

  const { skeleton, seeds } = chosen;
  const stats = gridStats(skeleton.grid);
  log(`Skeleton: ${stats.words} words, avg ${stats.avgLength.toFixed(2)}, ${stats.blocks} blocks (${(stats.blockPct * 100).toFixed(0)}%)`);
  const context = [
    theme && `Theme idea: ${theme}`,
    title && `Title: ${title}`,
    explanation && `Theme: ${explanation}`,
    seeds.length ? `Theme entries (locked): ${seeds.join(", ")}` : "Themeless puzzle.",
  ].filter(Boolean).join("\n");

  const rejected = new Set<string>();
  let approved: Record<string, string[]> = {};
  const seedEntries = seeds.map((w) => ({ word: w, score: 100, tags: "" }));
  const makeIndex = () => new WordIndex(mergeDicts(entries, seedEntries), minScore, rejected);
  let index = makeIndex();
  const skeletonEngine = new FillEngine(skeleton.grid, index, { maxShared, random });
  notes.push("## Skeleton", "```", ...gridToRows(skeleton.grid), "```", "Heatmap (X dead, ! 1–5 options, + 6–19, . 20+):", "```", ...heatmap(skeletonEngine), "```", "");

  if (useLlm) {
    const open = skeletonEngine.slots
      .map((s, si) => ({ s, si, options: skeletonEngine.slotOptions()[si] }))
      .filter(({ si }) => skeletonEngine.fixed[si] === null);
    const longest = open.slice().sort((a, b) => b.s.cells.length - a.s.cells.length).slice(0, skeleton.grid.width <= 5 ? 3 : 5);
    const tightest = open.filter((o) => !longest.includes(o) && o.options >= 2).sort((a, b) => a.options - b.options).slice(0, 3);
    const pick = [...longest, ...tightest].map(({ s }) => ({
      id: s.id,
      pattern: slotText(skeleton.grid, s),
      candidates: skeletonEngine.candidates(s.id, 25, "score").map((c) => c.word),
    })).filter((s) => s.candidates.length);
    log(`Curating ${pick.map((p) => p.id).join(", ")}…`);
    const decisions = await curate(skeleton.grid, pick, context);
    notes.push("## Curation");
    for (const d of decisions) {
      const slot = pick.find((p) => p.id === d.slot);
      if (!slot) continue;
      const ok = d.approve.map(normalizeEntry).filter((w) => slot.candidates.includes(w));
      if (ok.length) approved[d.slot] = ok;
      for (const r of d.reject) if (slot.candidates.includes(normalizeEntry(r.word)) && r.reason !== "other") rejected.add(normalizeEntry(r.word));
      notes.push(`- ${d.slot}: approved ${ok.join(", ") || "—"}; rejected ${d.reject.map((r) => `${r.word} (${r.reason})`).join(", ") || "—"}`);
    }
    notes.push("");
    index = makeIndex();
  }

  const fillOnce = (): Grid | null => {
    const timeMs = skeleton.grid.width <= 7 ? 8_000 : 30_000;
    let grid = new FillEngine(skeleton.grid, index, { maxShared, approved, random, timeMs }).fill();
    if (!grid && Object.keys(approved).length) {
      log("  approvals over-constrain the grid; relaxing the tightest");
      const relaxed = Object.fromEntries(Object.entries(approved).filter(([, words]) => words.length >= 4));
      grid = new FillEngine(skeleton.grid, index, { maxShared, approved: relaxed, random, timeMs }).fill();
      if (!grid) grid = new FillEngine(skeleton.grid, index, { maxShared, random, timeMs }).fill();
    }
    if (!grid && rejected.size) {
      log("  rejections over-constrain the grid; filling without them (review will flag what is left)");
      grid = new FillEngine(skeleton.grid, new WordIndex(mergeDicts(entries, seedEntries), minScore), { maxShared, random, timeMs }).fill();
    }
    return grid;
  };

  log("Filling…");
  // The skeleton search already found one fill; it is the fallback.
  let grid = fillOnce() ?? chosen.fill;
  let report = auditGrid(grid, index, maxShared);
  for (let round = 1; useLlm && round <= 3; round++) {
    log(`Review round ${round}…`);
    const verdict = await review(grid, report, context);
    const must = verdict.replace.filter((r) => r.severity === "must" && !seeds.includes(normalizeEntry(r.answer)));
    notes.push(`## Review ${round}: ${verdict.verdict}`, verdict.notes, ...verdict.replace.map((r) => `- [${r.severity}] ${r.answer}: ${r.reason}`), "");
    if (!must.length) break;
    for (const r of must) rejected.add(normalizeEntry(r.answer));
    approved = Object.fromEntries(Object.entries(approved).map(([k, ws]) => [k, ws.filter((w) => !rejected.has(w))]).filter(([, ws]) => ws.length));
    index = makeIndex();
    log(`  replacing ${must.map((r) => r.answer).join(", ")}`);
    const next = fillOnce();
    if (!next) {
      notes.push("Refill failed after those rejections; keeping the previous fill.");
      break;
    }
    grid = next;
    report = auditGrid(grid, index, maxShared);
  }
  notes.push("## Final fill", "```", ...gridToRows(grid), "```", "", "## Audit");
  notes.push(...(report.issues.length ? report.issues.map((i) => `- [${i.severity}] ${i.message}`) : ["- clean"]), "");
  const weakest = report.entries.filter((e) => !e.locked).sort((a, b) => a.score - b.score).slice(0, 6);
  notes.push(`Lowest-scored entries: ${weakest.map((e) => `${e.answer} (${e.score})`).join(", ")}`, "");

  const clues: Record<string, ClueSet> = {};
  if (useLlm) {
    log("Writing clues…");
    const answers = Object.fromEntries(slotsOf(grid).map((s) => [s.id, slotText(grid!, s)]));
    let rows = await writeClues(grid, context);
    for (let pass = 0; pass < 2; pass++) {
      for (const r of rows) if (answers[r.slot]) clues[r.slot] = { standard: r.standard.trim(), speed: r.speed.trim() };
      const problems = clueProblems(answers, clues);
      if (!problems.length) break;
      log(`  fixing ${problems.length} clue(s)`);
      rows = await writeClues(grid, context, problems);
    }
    const list = Object.entries(clues).map(([id, c]) => ({ slotId: id, answer: answers[id], clue: c.standard }));
    const budget = auditClues(list, "standard clue").filter((i) => i.kind !== "clue-budget" || true);
    notes.push("## Clues", `Budget: ${list.reduce((n, e) => n + e.clue.length, 0)} / ${clueBudget(list.length)} characters`, "");
    notes.push(...budget.map((i) => `- [${i.severity}] ${i.message}`));
    notes.push("| Slot | Answer | Standard | Speed |", "|---|---|---|---|");
    for (const s of slotsOf(grid)) {
      const c = clues[s.id];
      notes.push(`| ${s.id} | ${answers[s.id]} | ${c?.standard ?? ""} | ${c?.speed ?? ""} |`);
    }
    notes.push("");
  }

  const slug = (title || theme || `themeless-${grid.width}x${grid.height}`).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const outDir = path.resolve(flag("out") ?? "artifacts/seedgrid", `${new Date().toISOString().slice(0, 10)}-${slug}`);
  fs.mkdirSync(outDir, { recursive: true });
  const ipuz = toIpuz(grid, clues, {
    title: title || (seeds.length ? "Untitled" : `Mini ${grid.width}×${grid.height}`),
    author: flag("author") ?? "Crossword Clash",
    theme: explanation || theme || undefined,
  });
  fs.writeFileSync(path.join(outDir, "puzzle.ipuz"), JSON.stringify(ipuz, null, 2) + "\n");
  fs.writeFileSync(
    path.join(outDir, "session.json"),
    JSON.stringify({ theme, title, explanation, seeds, symmetry, minScore, maxShared, skeleton: gridToRows(skeleton.grid), fill: gridToRows(grid), approved, rejected: [...rejected] }, null, 2) + "\n",
  );
  const header = [
    `# ${title || "Untitled"}`,
    "",
    explanation || theme || "Themeless",
    "",
    `${grid.width}×${grid.height}, ${symmetry} symmetry, required score ${minScore}, model ${useLlm ? model : "none"}, ${((Date.now() - startedAt) / 1000).toFixed(0)}s, tokens ${usage.input} in / ${usage.output} out`,
    "",
  ];
  fs.writeFileSync(path.join(outDir, "review.md"), [...header, ...notes].join("\n") + "\n");

  log("");
  log(gridToRows(grid).join("\n"));
  log("");
  log(`→ ${path.relative(process.cwd(), outDir)}/puzzle.ipuz and review.md`);
  log(`  publish: pnpm daily:add YYYY-MM-DD ${path.relative(process.cwd(), path.join(outDir, "puzzle.ipuz"))}${title ? ` "${title}"` : ""}`);
  if (useLlm) log(`  tokens: ${usage.input} in / ${usage.output} out`);
}

await main();
