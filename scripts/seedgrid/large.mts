/**
 * Themed 15×15 pipeline, no browser session: theme + themers → skeleton →
 * scored fills → Claude's pick and swaps → clues → .ipuz, review.md and a
 * studio.json the studio can import.
 *
 *   pnpm seedgrid:large --theme "Football x music" \
 *     --seeds "touchdown under, goal post malone, kickoffspring, goal line dance" --allow-shared
 *   pnpm seedgrid:large --batch docs/large-puzzle-themes.json [--only baseball-x-music]
 *                                                     # the backlog (or any JSON/YAML list), continues past failures
 *   pnpm seedgrid:large --seeds "..." --dry-run       # stop after the skeleton
 *   pnpm seedgrid:large --seeds "..." --no-llm        # skeleton + best-scored fill, no API calls
 *
 * Flags: --title, --author, --difficulty easy|medium|hard, --min-score 50 (the score
 * the layout aims for), --seeds-floor 48 (the lowest floor to settle for; 47 is the list's
 * demoted catch-all tier), --fills 24,
 * --fill-ms 20000, --budget 120000 (skeleton search ms), --layouts 2 (skeletons to compare;
 * the one whose best quick fill scores highest wins), --allow-shared (themers may
 * share a run longer than the engine's limit), --bonus FILE (theme-bonus words; default
 * wordlists/theme-bonus/<slug>.dict), --dict FILE (word list; default the studio's
 * production list), --out DIR (default artifacts/seedgrid), --model ID, --seed N.
 *
 * The grid math is the studio's own engine (ingrid_core via wasm) and the
 * skeleton finder; Claude only picks among fills the engine made, swaps in
 * entries the engine has proven fit, and writes clues (make.mts's machinery).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { initSync, Engine } from "../../src/lib/seedgrid/wasm/seedgrid_engine.js";
import { IngridEngine, type EngineRules } from "../../src/lib/seedgrid/ingrid";
import { normalizeEntry, parseDict, WordIndex } from "../../src/lib/seedgrid/dictionary";
import { blackBlocks, blackCorners, cloneGrid, gridStats, gridToRows, MAX_SHARED, meetsGridStandards, slotsOf, slotText, type Grid, type Slot } from "../../src/lib/seedgrid/grid";
import { findSkeleton } from "../../src/lib/seedgrid/skeletonFinder";
import { auditClues, auditGrid, clueBudget } from "../../src/lib/seedgrid/audit";
import { clueProblems, cluesRequest, CONSTRUCTOR, type ClueRow, type Difficulty } from "../../src/lib/seedgrid/cluePrompt";
import { toIpuz, type ClueSet } from "../../src/lib/seedgrid/ipuz";
import { newPuzzleId, slotKey, type StudioState } from "../../src/lib/seedgrid/studioState";
import { mulberry32 } from "../../src/lib/seedgrid/random";
import {
  longestSharedRun,
  nestedEntries,
  parseWordSet,
  PARTIAL_PENALTY,
  SUBTIER_PENALTY,
  SCORE_CEILING,
  scoreFill,
  themeSlug,
  validateSeeds,
  type FillScore,
  type ScoreContext,
} from "../../src/lib/seedgrid/themedLarge";
import { assertApiKey, callJson, DEFAULT_MODEL, usage } from "./claude.mts";

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
const dryRun = Boolean(flags["dry-run"]);
const size = Number(flag("size") ?? 15);
const minScore = Number(flag("min-score") ?? 50);
const seedsFloor = Number(flag("seeds-floor") ?? 48);
const fillCount = Number(flag("fills") ?? 24);
const fillMs = Number(flag("fill-ms") ?? 20_000);
const budgetMs = Number(flag("budget") ?? 120_000);
const layoutCount = Number(flag("layouts") ?? 2);
const model = flag("model") ?? DEFAULT_MODEL;
const outRoot = path.resolve(flag("out") ?? "artifacts/seedgrid");
const random = mulberry32(Number(flag("seed") ?? Date.now() % 2 ** 31));
const log = (...a: unknown[]) => console.log(...a);
const today = () => new Date().toISOString().slice(0, 10);

// ---- Theme specs ----
interface ThemeSpec {
  theme: string;
  seeds: string[];
  title?: string;
  author?: string;
  difficulty?: Difficulty;
  /** Theme-bonus list path, overriding wordlists/theme-bonus/<slug>.dict. */
  bonus?: string;
  allowShared?: boolean;
  /** Folder and bonus-file name; derived from the title or theme when absent. */
  slug?: string;
  /** Themer → clue sketch from the backlog, handed to the clue writer as a starting point. */
  clueSketches?: Record<string, string>;
}

function specsFromFlags(): ThemeSpec[] {
  const seeds = flag("seeds");
  if (!seeds) {
    console.error('Give the themers: --seeds "touchdown under, goal post malone, ..." (and --theme "Football x music"), or --batch themes.json');
    process.exit(1);
  }
  return [
    {
      theme: flag("theme") ?? "",
      seeds: seeds.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      title: flag("title"),
      author: flag("author"),
      difficulty: flag("difficulty") as Difficulty | undefined,
      bonus: flag("bonus"),
      allowShared: Boolean(flags["allow-shared"]),
    },
  ];
}

/**
 * A JSON or YAML file: a list of themes, or `{ themes: [...] }`. Each theme gives
 * its seeds as a list, a comma string, or the backlog's `entries: [[ANSWER, clue
 * sketch], ...]` (docs/large-puzzle-themes.json). `--only slug` keeps one theme.
 */
function specsFromFile(file: string): ThemeSpec[] {
  const text = fs.readFileSync(file, "utf8");
  const parsed = (/\.ya?ml$/i.test(file) ? YAML.parse(text) : JSON.parse(text)) as unknown;
  const list = Array.isArray(parsed) ? parsed : (parsed as { themes?: unknown[] })?.themes;
  if (!Array.isArray(list)) throw new Error(`${file}: expected a list of themes or { themes: [...] }`);
  const only = flags.only ? new Set(flags.only) : null;
  return list
    .map((raw, i) => {
      const t = raw as Record<string, unknown>;
      const entries = Array.isArray(t.entries) ? (t.entries as unknown[]).map((e) => (Array.isArray(e) ? [String(e[0]), e[1] ? String(e[1]) : ""] : [String(e), ""])) : [];
      const seeds = Array.isArray(t.seeds) ? t.seeds.map(String) : typeof t.seeds === "string" ? t.seeds.split(/[,\n]/) : entries.map(([a]) => a);
      if (!seeds.length) throw new Error(`${file}: theme #${i + 1} has no seeds or entries`);
      const concepts = Array.isArray(t.concepts) ? t.concepts.map(String).join(" x ") : "";
      return {
        theme: String(t.theme ?? t.name ?? concepts),
        seeds: seeds.map((s) => s.trim()).filter(Boolean),
        title: t.title ? String(t.title) : flag("title"),
        author: t.author ? String(t.author) : flag("author"),
        difficulty: (t.difficulty as Difficulty | undefined) ?? (flag("difficulty") as Difficulty | undefined),
        bonus: t.bonus ? String(t.bonus) : undefined,
        allowShared: Boolean(t.allowShared ?? t["allow-shared"] ?? flags["allow-shared"]),
        slug: t.slug ? String(t.slug) : undefined,
        clueSketches: Object.fromEntries(entries.filter(([, c]) => c).map(([a, c]) => [normalizeEntry(a), c])),
      } satisfies ThemeSpec;
    })
    .filter((t) => !only || only.has(t.slug ?? "") || only.has(themeSlug(t.title ?? "")) || only.has(themeSlug(t.theme)));
}

// ---- Word lists and engine ----
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const listFile = (name: string) => path.join(here, "wordlists", name);

function wordListPath(): string {
  if (flag("dict")) return path.resolve(flag("dict")!);
  const name = process.env.SEEDGRID_WORD_LIST === "base" ? "words.dict" : "words-production.dict";
  const file = path.join(root, "public/seedgrid", name);
  if (!fs.existsSync(file)) {
    console.error(`Missing public/seedgrid/${name}. Run \`pnpm seedgrid:dict\` then \`pnpm seedgrid:studio-dict\` first.`);
    process.exit(1);
  }
  return file;
}

if (useLlm && !dryRun) assertApiKey();
const dictPath = wordListPath();
const dictText = fs.readFileSync(dictPath, "utf8");
const dictEntries = parseDict(dictText);
const scores = new Map(dictEntries.map((e) => [e.word, e.score]));
const ban = fs.existsSync(listFile("ban.dict")) ? parseWordSet(fs.readFileSync(listFile("ban.dict"), "utf8")) : new Set<string>();
// ENABLE (public domain) tells the partial heuristic which entries are single real words; optional.
const enableFile = path.join(root, "scripts/mini-generator/wordlists/enable1.txt");
const singleWords: Set<string> | undefined = fs.existsSync(enableFile) ? new Set(fs.readFileSync(enableFile, "utf8").split("\n").map((w: string) => w.trim().toUpperCase()).filter(Boolean)) : undefined;

initSync({ module: fs.readFileSync(path.join(root, "src/lib/seedgrid/wasm/seedgrid_engine_bg.wasm")) });
const engine = new IngridEngine(new Engine(dictText, MAX_SHARED, 21));
log(`Engine ready: ${engine.wordCount} words from ${path.relative(process.cwd(), dictPath)}, ${ban.size} banned${singleWords ? `, ENABLE loaded` : ""}`);

// ---- Claude steps ----
interface FillCandidate {
  index: number;
  seed: number;
  grid: Grid;
  score: FillScore;
  /** Engine entries the audit would block (nested in another entry, or sharing too long a run with a themer). */
  blocks: string[];
}

interface FillVerdict {
  pick: number;
  replace: { answer: string; reason: string; severity: "must" | "nice" }[];
  notes: string;
}

function describeFill(f: FillCandidate, scores: Map<string, number>): string {
  const weak = new Set(f.score.weak.map((w) => w.answer));
  const entries = slotsOf(f.grid)
    .filter((s) => !s.cells.every((i) => f.grid.locked[i]))
    .map((s) => {
      const a = slotText(f.grid, s);
      return `${s.id} ${a} (${scores.get(a) ?? 0}${weak.has(a) ? `; ${f.score.weak.find((w) => w.answer === a)!.reasons.join(", ")}` : ""})`;
    });
  return [`Fill ${f.index} — quality ${f.score.total.toFixed(0)}, mean score ${f.score.mean.toFixed(1)}`, ...gridToRows(f.grid), "Entries (list score; flags):", entries.join("\n")].join("\n");
}

async function pickFill(shortlist: FillCandidate[], context: string, round: number): Promise<FillVerdict> {
  return callJson<FillVerdict>({
    model,
    system: CONSTRUCTOR,
    prompt: `${context}

${shortlist.length > 1 ? `The engine produced these ${shortlist.length} complete fills of the same skeleton (theme entries are locked and never change). Pick the one you would ship, then list entries in it to replace.` : `Review this fill (round ${round}); the theme entries are locked.`}
Replacement severity:
- "must": a solver racing the clock would not know it or could not get it from crossings (obscure, crosswordese, unfair proper-noun cross), an ugly partial, a duplicate, an abbreviation crossing an abbreviation, or anything crude, sad or gross.
- "nice": acceptable but could be better.
For a pile-up, name the single entry whose removal helps most. Never list theme entries. Rejected "must" entries are banned from the whole puzzle and the engine refills around them, so only name what truly has to go.

${shortlist.map((f) => describeFill(f, scores)).join("\n\n")}`,
    schema: {
      type: "object",
      properties: {
        pick: { type: "integer", description: "The Fill number to keep" },
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
      required: ["pick", "replace", "notes"],
    },
  });
}

interface SwapOffer {
  slot: Slot;
  current: string;
  candidates: { word: string; score: number }[];
}

async function chooseSwaps(grid: Grid, offers: SwapOffer[], context: string): Promise<{ slot: string; word: string; reason: string }[]> {
  const { swaps } = await callJson<{ swaps: { slot: string; word: string; reason: string }[] }>({
    model,
    system: CONSTRUCTOR,
    prompt: `${context}
Filled grid:
${gridToRows(grid).join("\n")}

For each slot below, the engine lists every alternative that fits the crossings as they stand (swapping only that entry). Choose a better entry where one exists, or keep the current one (word = "keep"). Prefer in-the-language phrases and fresh vocabulary; never pick crosswordese, partials, abbreviations, or anything crude.

${offers.map((o) => `${o.slot.id} currently ${o.current} (${scores.get(o.current) ?? 0}): ${o.candidates.map((c) => `${c.word} (${c.score})`).join(", ")}`).join("\n")}`,
    schema: {
      type: "object",
      properties: {
        swaps: {
          type: "array",
          items: {
            type: "object",
            properties: { slot: { type: "string" }, word: { type: "string" }, reason: { type: "string" } },
            required: ["slot", "word", "reason"],
          },
        },
      },
      required: ["swaps"],
    },
  });
  return swaps;
}

async function reviewClues(grid: Grid, context: string, answers: Record<string, string>, clues: Record<string, ClueSet>): Promise<{ slot: string; problem: string }[]> {
  const { problems } = await callJson<{ problems: { slot: string; problem: string }[] }>({
    model,
    system: CONSTRUCTOR,
    prompt: `${context}
Grid:
${gridToRows(grid).join("\n")}

Review these drafted clues as the editor before they ship. Flag only clues that break the content rule (crude, sad, gross, mocking a dialect, accent or group, or apologizing for the entry), are unfair or factually wrong, or give the answer away. Return an empty list when all are fine; one problem per flagged slot, in a few words.

${Object.keys(answers).map((id) => `${id} ${answers[id]}: ${clues[id]?.standard ?? "(missing)"} / ${clues[id]?.speed ?? ""}`).join("\n")}`,
    schema: {
      type: "object",
      properties: {
        problems: { type: "array", items: { type: "object", properties: { slot: { type: "string" }, problem: { type: "string" } }, required: ["slot", "problem"] } },
      },
      required: ["problems"],
    },
  });
  return problems.filter((p) => answers[p.slot]);
}

async function writeClues(grid: Grid, context: string, difficulty: Difficulty, fix?: { slot: string; problem: string }[]): Promise<ClueRow[]> {
  const req = cluesRequest(grid, context, { difficulty, fix });
  const { clues } = await callJson<{ clues: ClueRow[] }>({ model, ...req, maxTokens: Math.max(req.maxTokens, 12000) });
  return clues;
}

// ---- Helpers ----
const fillEntries = (grid: Grid) => slotsOf(grid).map((s) => ({ slotId: s.id, answer: slotText(grid, s), locked: s.cells.every((i) => grid.locked[i]) }));

/** The engine refuses dupes and long shared runs between its own entries; a hand swap must keep that promise. */
function swapIsClean(grid: Grid, slot: Slot, word: string): string | null {
  for (const other of slotsOf(grid)) {
    if (other.id === slot.id) continue;
    const text = slotText(grid, other);
    const locked = other.cells.every((i) => grid.locked[i]);
    if (text === word) return `duplicates ${other.id}`;
    const run = longestSharedRun(word, text);
    if (!locked && (run.length > MAX_SHARED || text.includes(word) || word.includes(text))) return `shares ${run} with ${text}`;
    if (locked && word.length >= 4 && text.includes(word)) return `sits inside ${text}`;
  }
  return null;
}

function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(0)}s`;
}

type Stage = "seeds" | "skeleton" | "fill" | "review" | "clues" | "output" | "done";
/** Where buildTheme is, so an unexpected throw is reported against the right stage. */
let stage: Stage = "seeds";

interface ThemeOutcome {
  theme: string;
  title: string;
  ok: boolean;
  stage: Stage;
  floor?: number;
  quality?: number;
  weak?: string[];
  dir?: string;
  error?: string;
  ms: number;
}

// ---- Pipeline ----
async function buildTheme(spec: ThemeSpec): Promise<ThemeOutcome> {
  const startedAt = Date.now();
  const notes: string[] = [];
  const theme = spec.theme.trim();
  const slug = spec.slug || themeSlug(spec.title || theme || spec.seeds[0]);
  let title = spec.title ?? "";
  const difficulty: Difficulty = spec.difficulty ?? "medium";
  const outcome = (o: Partial<ThemeOutcome> & Pick<ThemeOutcome, "ok" | "stage">): ThemeOutcome => ({ theme, title, ms: Date.now() - startedAt, ...o });

  // 1. Themers.
  stage = "seeds";
  const validation = validateSeeds(spec.seeds, { size, maxShared: MAX_SHARED, allowShared: spec.allowShared });
  if (!validation.ok) {
    const error = validation.errors.join("\n");
    console.error(`✗ ${theme || spec.seeds.join(", ")}:\n  ${error.replace(/\n/g, "\n  ")}`);
    return outcome({ ok: false, stage: "seeds", error });
  }
  const { seeds, pairing } = validation;
  log(`\n== ${title || theme || seeds.join(", ")} ==`);
  log(`Themers: ${pairing.pairs.map(([a, b]) => `${a}/${b} (${a.length})`).join(", ")}${pairing.center ? `, ${pairing.center} centered (${pairing.center.length})` : ""}`);
  for (const w of validation.warnings) log(`  note: ${w}`);
  notes.push(
    "## Seeds",
    "| Entry | Letters | Placement |",
    "|---|---|---|",
    ...pairing.pairs.flatMap(([a, b]) => [`| ${a} | ${a.length} | mirrors ${b} |`, `| ${b} | ${b.length} | mirrors ${a} |`]),
    ...(pairing.center ? [`| ${pairing.center} | ${pairing.center.length} | center row |`] : []),
    "",
    ...validation.warnings.map((w) => `- ${w} (kept with --allow-shared; the engine's limit binds its own entries only)`),
    "",
  );

  // Theme-bonus words, if a list exists for this theme.
  const bonusFile = spec.bonus ? path.resolve(spec.bonus) : path.join(here, "wordlists/theme-bonus", `${spec.slug || themeSlug(theme || slug)}.dict`);
  const bonus = fs.existsSync(bonusFile) ? parseWordSet(fs.readFileSync(bonusFile, "utf8")) : undefined;
  if (bonus) log(`Theme bonus: ${bonus.size} words from ${path.relative(process.cwd(), bonusFile)}`);
  const vocab = new Set(dictEntries.filter((e) => e.score >= minScore).map((e) => e.word));
  const ctx: ScoreContext = { scores, ban, bonus, vocab, singleWords, cleanScore: minScore };

  stage = "skeleton";
  // 2. Skeleton(s). The finder returns the first layout that fills; with several, the one whose
  // quick fills score best wins, since different layouts put the thin spots in different places.
  const floorSteps = [...new Set([5, 10, 15].filter((d) => minScore - d > seedsFloor).concat(minScore > seedsFloor ? [minScore - seedsFloor] : []))];
  const banList = [...ban];
  const rejected = new Set<string>();
  interface Layout {
    grid: Grid;
    floor: number;
    attempts: number;
    ms: number;
    /** Best quality per entry among a few quick fills (set when comparing layouts). */
    quality?: number;
    /** Fewest flagged entries among those quick fills: the number the editor will see. */
    flagged?: number;
    /** Options in the tightest open slot at the floor; two means any rejection there kills the fill. */
    tightest?: number;
  }
  const layouts: Layout[] = [];
  const wanted = dryRun ? 1 : Math.max(1, layoutCount);
  for (let n = 1; n <= wanted; n++) {
    log(`Laying out a ${size}×${size}${wanted > 1 ? ` (layout ${n} of ${wanted})` : ""}: score ${minScore}, settling as low as ${seedsFloor}, budget ${fmtSeconds(budgetMs)}…`);
    const t0 = Date.now();
    const found = findSkeleton(engine, { size, symmetry: "rotational", seeds, rules: { minScore, rejected: banList }, attempts: 60 }, { random, budgetMs, floorSteps });
    const ms = Date.now() - t0;
    if (!found.grid) {
      log(`  no fillable skeleton in ${fmtSeconds(ms)} (${found.attempts} legal skeletons examined)`);
      continue;
    }
    if (found.minScore < seedsFloor) {
      log(`  only fills at floor ${found.minScore}, below --seeds-floor ${seedsFloor}`);
      continue;
    }
    if (!meetsGridStandards(found.grid)) {
      log(`  breaks the grid standards (black corners ${blackCorners(found.grid).join(",") || "none"}; 2×2 blocks ${blackBlocks(found.grid).join(",") || "none"}); skipped`);
      continue;
    }
    if (layouts.some((l) => l.grid.cells.join("") === found.grid!.cells.join(""))) {
      log(`  same skeleton as an earlier layout`);
      continue;
    }
    log(`  fills at floor ${found.minScore}, ${found.attempts} skeletons examined, ${fmtSeconds(ms)}`);
    layouts.push({ grid: found.grid, floor: found.minScore, attempts: found.attempts, ms });
  }
  if (!layouts.length) {
    const error = `No fillable skeleton at any floor from ${minScore} down to ${seedsFloor} within ${fmtSeconds(budgetMs)} per layout. Try --seeds-floor 45 (the list's catch-all tier; stacked 13/14s usually need it), a longer --budget, or different themers.`;
    console.error(`✗ ${error}`);
    return outcome({ ok: false, stage: "skeleton", error });
  }

  const subTier = (grid: Grid, atScore: number) => slotsOf(grid).filter((s) => !s.cells.every((i) => grid.locked[i]) && (scores.get(slotText(grid, s)) ?? 0) < atScore).map((s) => s.id);
  /**
   * A layout only fills at the lower floor, but most slots do not need it: re-fill at the
   * requested score everywhere except the slots that came out sub-tier, and repeat while that
   * set shrinks. What is left is the set of slots that provably need the lower floor.
   */
  const tighten = (skeleton: Grid, floor: number, first: Grid, seed: number): Grid => {
    let grid = first;
    if (floor >= minScore) return grid;
    let relaxed = subTier(grid, minScore);
    for (let step = 0; step < 4 && relaxed.length; step++) {
      const res = engine.fill(skeleton, { minScore, rejected: [...banList, ...rejected], minScoreBySlot: Object.fromEntries(relaxed.map((id) => [id, floor])) }, { timeoutMs: fillMs / 2, seed: seed + step + 1 });
      if (!res.ok) break;
      grid = res.grid;
      const next = subTier(grid, minScore);
      if (next.length >= relaxed.length) break;
      relaxed = next;
    }
    return grid;
  };
  const quickFill = (layout: Layout, seed: number): Grid | null => {
    const res = engine.fill(layout.grid, { minScore: layout.floor, rejected: [...banList, ...rejected] }, { timeoutMs: fillMs, seed });
    return res.ok ? tighten(layout.grid, layout.floor, res.grid, seed) : null;
  };
  const tightestSlot = (layout: Layout): number => {
    const h = engine.options(layout.grid, { minScore: layout.floor, rejected: banList });
    const open = slotsOf(layout.grid).filter((s) => !s.cells.every((i) => layout.grid.locked[i]));
    return Math.min(...open.map((s) => h.counts[s.id] ?? 0));
  };
  if (layouts.length > 1) {
    for (const layout of layouts) {
      layout.tightest = tightestSlot(layout);
      // Fewest flagged entries first (what the editor will have to fix), then quality per engine
      // entry, so a choppy grid full of easy threes does not outscore an open one.
      const fills = Array.from({ length: 4 }, () => quickFill(layout, Math.floor(random() * 2 ** 31)))
        .filter((g): g is Grid => Boolean(g))
        .map((g) => scoreFill(fillEntries(g), ctx))
        .filter((sc) => !sc.banned.length && sc.count);
      layout.quality = fills.length ? Math.max(...fills.map((sc) => sc.total / sc.count)) : -Infinity;
      layout.flagged = fills.length ? Math.min(...fills.map((sc) => sc.weak.length)) : Infinity;
    }
    // A skeleton whose tightest slot has under four options is fragile: Claude's first rejection
    // there makes it unfillable. Then fewest flagged entries, then quality per entry.
    const room = (l: Layout) => Math.min(l.tightest ?? 0, 4);
    layouts.sort((a, b) => room(b) - room(a) || (a.flagged ?? Infinity) - (b.flagged ?? Infinity) || (b.quality ?? -Infinity) - (a.quality ?? -Infinity) || b.floor - a.floor);
    log(`Layouts by quick fills (tightest slot, flagged entries, quality per entry): ${layouts.map((l) => `${l.tightest} options, ${l.flagged === Infinity ? "unfilled" : `${l.flagged} flagged, ${l.quality!.toFixed(1)}`} (floor ${l.floor})`).join("; ")}`);
  }
  const { grid: skeleton, floor } = layouts[0];
  const stats = gridStats(skeleton);
  const heat = engine.options(skeleton, { minScore: floor, rejected: banList });
  const free = slotsOf(skeleton).filter((s) => !s.cells.every((i) => skeleton.locked[i]));
  const tightest = free.map((s) => ({ id: s.id, n: heat.counts[s.id] ?? 0 })).sort((a, b) => a.n - b.n).slice(0, 5);
  log(gridToRows(skeleton).join("\n"));
  log(`Skeleton fills at floor ${floor}${floor < minScore ? ` (requested ${minScore})` : ""}: ${stats.words} words, ${stats.blocks} blocks (${(stats.blockPct * 100).toFixed(0)}%), avg ${stats.avgLength.toFixed(2)}`);
  log(`Tightest slots: ${tightest.map((t) => `${t.id} (${t.n})`).join(", ")}`);
  notes.push(
    "## Skeleton",
    "```",
    ...gridToRows(skeleton),
    "```",
    `Fills at floor **${floor}**${floor < minScore ? ` (requested ${minScore}; the list runs thin around stacked themers at ${minScore})` : ""}. ${layouts.length > 1 ? `Best of ${layouts.length} layouts by tightest slot, then quick fills (${layouts.map((l) => `${l.tightest} options in the tightest slot, ${l.flagged === Infinity ? "unfilled" : `${l.flagged} flagged, quality ${l.quality!.toFixed(1)} per entry`} at floor ${l.floor}`).join("; ")}); this one took` : "Found after"} ${layouts[0].attempts} legal skeletons in ${fmtSeconds(layouts[0].ms)}.`,
    `${stats.words} words, ${stats.blocks} blocks (${(stats.blockPct * 100).toFixed(0)}%), average length ${stats.avgLength.toFixed(2)}, ${stats.threes} three-letter entries. Corners white, no 2×2 black block (grid standards).`,
    `Tightest open slots at floor ${floor}: ${tightest.map((t) => `${t.id} (${t.n} options)`).join(", ")}.`,
    "",
  );
  if (dryRun) {
    log("Dry run: stopping after the skeleton.");
    return outcome({ ok: true, stage: "skeleton", floor });
  }

  // 3. Fills.
  stage = "fill";
  const rules = (): EngineRules => ({ minScore: floor, rejected: [...banList, ...rejected] });
  const seen = new Set<string>();
  let fillIndex = 0;
  const index = new WordIndex(dictEntries, floor);
  /**
   * Engine entries an editor's audit blocks: nested inside another entry (ALE in ALEE; a 3-letter
   * word inside a locked themer is allowed), or sharing a run longer than the limit with a themer.
   */
  const auditBlocks = (grid: Grid): string[] => {
    const entries = fillEntries(grid);
    const byId = new Map(entries.map((e) => [e.slotId, e]));
    const out = new Set(nestedEntries(entries).map((n) => n.inner.answer));
    for (const issue of auditGrid(grid, index, MAX_SHARED).issues) {
      if (issue.severity !== "block" || issue.kind !== "duplicate") continue;
      const [a, b] = issue.slots.map((id) => byId.get(id)!);
      if (a.answer.includes(b.answer) || b.answer.includes(a.answer)) continue; // nesting: judged above
      for (const e of [a, b]) if (!e.locked) out.add(e.answer);
    }
    return [...out];
  };
  const candidate = (grid: Grid, seed: number): FillCandidate => ({ index: ++fillIndex, seed, grid, score: scoreFill(fillEntries(grid), ctx), blocks: auditBlocks(grid) });
  const runFills = (count: number, label: string): FillCandidate[] => {
    const out: FillCandidate[] = [];
    log(`${label}: ${count} fills at floor ${floor}${floor < minScore ? `, each tightened toward ${minScore}` : ""}, up to ${fmtSeconds(fillMs)} each…`);
    for (let i = 0; i < count; i++) {
      const seed = Math.floor(random() * 2 ** 31);
      const res = engine.fill(skeleton, rules(), { timeoutMs: fillMs, seed });
      if (!res.ok) {
        log(`  fill ${i + 1}: ${res.reason} after ${fmtSeconds(res.ms)}`);
        if (res.reason === "unfillable") {
          if (rejected.size) notes.push(`The layout cannot be filled with ${[...rejected].join(", ")} rejected.`, "");
          break;
        }
        continue;
      }
      const grid = tighten(skeleton, floor, res.grid, seed);
      const key = grid.cells.join("");
      if (seen.has(key)) {
        log(`  fill ${i + 1}: duplicate of an earlier fill`);
        continue;
      }
      seen.add(key);
      const cand = candidate(grid, seed);
      const { score } = cand;
      out.push(cand);
      const weak = score.weak.slice(0, 4).map((w) => `${w.answer} (${w.reasons.join(", ")})`).join(", ");
      log(`  fill ${cand.index}: quality ${score.total.toFixed(0)}, mean ${score.mean.toFixed(1)}, ${score.weak.length} flagged${cand.blocks.length ? `, blocks: ${cand.blocks.join(", ")}` : ""}${score.banned.length ? ` — REJECTED, banned: ${score.banned.join(", ")}` : weak ? ` — ${weak}${score.weak.length > 4 ? ", …" : ""}` : ""}`);
    }
    return out;
  };
  const considered: FillCandidate[] = runFills(fillCount, "Filling");
  // Block-free fills first, then by quality.
  const usable = (list: FillCandidate[]) => list.filter((f) => !f.score.banned.length).sort((a, b) => a.blocks.length - b.blocks.length || b.score.total - a.score.total);
  let shortlist = usable(considered).slice(0, 3);
  if (!shortlist.length) {
    const error = `No usable fill: ${considered.length} produced, ${considered.filter((f) => f.score.banned.length).length} with banned words.`;
    console.error(`✗ ${error}`);
    return outcome({ ok: false, stage: "fill", error, floor });
  }
  const fillTable = (list: FillCandidate[]) => [
    "| Fill | Quality | Mean score | Weak entries | Audit blocks | Verdict |",
    "|---|---|---|---|---|---|",
    ...list.map((f) => `| ${f.index} | ${f.score.total.toFixed(0)} | ${f.score.mean.toFixed(1)} | ${f.score.weak.map((w) => `${w.answer} (${w.reasons.join(", ")})`).join(", ") || "—"} | ${f.blocks.join(", ") || "—"} | ${f.score.banned.length ? `rejected: banned ${f.score.banned.join(", ")}` : shortlist.includes(f) ? "shortlist" : "—"} |`),
  ];
  notes.push(
    "## Fills considered",
    `${considered.length} distinct fills${floor < minScore ? `, each re-filled at ${minScore} everywhere but the slots that need ${floor}` : ""}. Quality = Σ min(score, ${SCORE_CEILING}) − ${minScore} over engine entries; an entry under ${minScore} loses the gap again plus ${SUBTIER_PENALTY}; −${PARTIAL_PENALTY} per partial-looking entry, −15 when an entry sits inside another${bonus ? ", +10 per theme-bonus word" : ""}. Fills with audit blocks rank last whatever their quality.`,
    "",
    ...fillTable(considered),
    "",
  );
  log(`Shortlist: ${shortlist.map((f) => `#${f.index} (${f.score.total.toFixed(0)})`).join(", ")}`);

  // 4. Claude picks and rejects; audit blocks count as "must"; then local refills and swaps.
  stage = "review";
  let chosen = shortlist[0];
  const context = [
    theme && `Theme idea: ${theme}`,
    title && `Title: ${title}`,
    `Theme entries (locked): ${seeds.join(", ")}`,
  ].filter(Boolean).join("\n");
  /** "Must" entries Claude still wanted out of the shipped fill; the editor's to fix. */
  const leftForEditor: string[] = [];
  /** True unless the engine proves the skeleton unfillable under the current rejections. */
  const fillableNow = (): boolean => {
    const r = engine.fill(skeleton, rules(), { timeoutMs: 3000, seed: 7 });
    return r.ok || r.reason === "timeout";
  };
  /**
   * Rejects the named entries and refills. The pick is then the best block-free fill among
   * every fill so far that avoids the rejections, not only the new batch, so repeated rounds
   * cannot drift toward worse fills. A word the layout forces (rejecting it alone makes the
   * skeleton unfillable) is kept, reported, and left for the editor.
   */
  const respectsRejections = (f: FillCandidate) => !fillEntries(f.grid).some((e) => !e.locked && rejected.has(e.answer));
  const rejectAndRefill = (words: string[], label: string): boolean => {
    for (const w of words) rejected.add(w);
    if (!fillableNow()) {
      for (const w of words) rejected.delete(w);
      const forced: string[] = [];
      for (const w of words) {
        rejected.add(w);
        if (!fillableNow()) {
          rejected.delete(w);
          forced.push(w);
        }
      }
      if (forced.length) {
        leftForEditor.push(...forced);
        notes.push(`The layout forces ${forced.join(", ")}: rejecting ${forced.length === 1 ? "it" : "them"} leaves the skeleton unfillable, so ${forced.length === 1 ? "it stays" : "they stay"} for the editor.`, "");
        log(`  forced by the layout, left for the editor: ${forced.join(", ")}`);
      }
      words = words.filter((w) => !forced.includes(w));
      if (!words.length) return false;
    }
    const refills = runFills(fillCount, label);
    considered.push(...refills);
    const best = usable(considered.filter(respectsRejections))[0];
    if (!best) {
      notes.push(`Refill after rejecting ${words.join(", ")} produced nothing usable; keeping fill ${chosen.index}.`, "");
      log("  refill failed; keeping the previous fill");
      return false;
    }
    shortlist = [best];
    notes.push(`Refilled without ${words.join(", ")} (best of every fill so far that avoids the rejections: #${best.index}):`, "", ...fillTable(refills), "");
    chosen = best;
    return true;
  };
  /** The fill Claude last reviewed, so the closing review can be skipped when nothing changed. */
  let lastReviewed: { key: string; clean: boolean } | null = null;
  const reviewRound = async (list: FillCandidate[], round: number | "closing"): Promise<string[]> => {
    log(`Review ${round === "closing" ? "of the fill that ships" : `round ${round}`}…`);
    const verdict = await pickFill(list, context, typeof round === "number" ? round : 99);
    const picked = list.find((f) => f.index === verdict.pick) ?? list[0];
    chosen = picked;
    const must = verdict.replace.filter((r) => r.severity === "must").map((r) => ({ ...r, answer: normalizeEntry(r.answer) })).filter((r) => !seeds.includes(r.answer) && slotsOf(chosen.grid).some((s) => slotText(chosen.grid, s) === r.answer));
    notes.push(`## Claude's review${round === "closing" ? " of the fill that ships" : `, round ${round}`}`, `Picked fill ${picked.index}. ${verdict.notes}`, ...verdict.replace.map((r) => `- [${r.severity}] ${r.answer}: ${r.reason}`), "");
    log(`  picked fill ${picked.index}${must.length ? `; must replace ${must.map((r) => r.answer).join(", ")}` : "; nothing must go"}`);
    lastReviewed = { key: chosen.grid.cells.join(""), clean: !must.length };
    return must.map((r) => r.answer);
  };
  if (useLlm) {
    // Up to three refills driven by Claude's "must" entries; the fill that ships gets its own review at the end.
    for (let round = 1; round <= 3; round++) {
      const must = await reviewRound(round === 1 ? shortlist : [chosen], round);
      if (!must.length) break;
      if (!rejectAndRefill(must, "  Refilling")) break;
    }
  } else {
    notes.push("## Pick", `No LLM (--no-llm): kept the best-scored fill, #${chosen.index}.`, "");
  }

  // Audit blocks are "must" entries too: reject the nested entry and refill until none is left.
  // Around stacked themers a short entry can be forced (NOL between two themers), so when
  // rejecting it leaves the layout unfillable, reject the host word instead.
  for (let attempt = 0; attempt < 3 && chosen.blocks.length; attempt++) {
    const inners = chosen.blocks;
    log(`Audit blocks ${inners.join(", ")}; rejecting and refilling…`);
    notes.push(`## Audit blocks, pass ${attempt + 1}`, `Fill ${chosen.index} has ${inners.join(", ")} nested in another entry; rejected.`, "");
    if (rejectAndRefill(inners, "  Refilling")) continue;
    const entries = fillEntries(chosen.grid);
    const hosts = [...new Set(nestedEntries(entries).filter((n) => inners.includes(n.inner.answer) && !n.host.locked).map((n) => n.host.answer))];
    for (const w of inners) rejected.delete(w);
    if (!hosts.length) break;
    notes.push(`The layout cannot be filled without ${inners.join(", ")}; rejecting the host entries ${hosts.join(", ")} instead.`, "");
    log(`  ${inners.join(", ")} forced by the layout; rejecting ${hosts.join(", ")} instead`);
    if (!rejectAndRefill(hosts, "  Refilling")) break;
  }
  if (chosen.blocks.length) {
    const error = `Could not clear the audit blocks (${chosen.blocks.join(", ")}) in three refills.`;
    console.error(`✗ ${error}`);
    return outcome({ ok: false, stage: "review", error, floor });
  }

  // Local refills (the studio's pair-swap): for each flagged entry, reject it, blank it and its
  // crossings' engine letters, and refill that neighborhood at the requested score. Kept only when
  // the fill scores better and stays block-free.
  const flaggedSlots = (grid: Grid, score: FillScore) =>
    slotsOf(grid)
      .filter((s) => !s.cells.every((i) => grid.locked[i]))
      .map((s) => ({ s, text: slotText(grid, s), score: scores.get(slotText(grid, s)) ?? 0 }))
      .filter((x) => x.score < minScore || score.weak.some((w) => w.answer === x.text))
      .sort((a, b) => a.score - b.score);
  const localRefill = (grid: Grid, slot: Slot): Grid | null => {
    const current = slotText(grid, slot);
    const all = slotsOf(grid);
    // Around stacked themers the first ring of crossings is often only a few free cells and the
    // engine proves it has no alternative, so widen to the crossings' crossings when needed.
    const ring = (depth: number): Slot[] => {
      let set = [slot];
      for (let d = 0; d < depth; d++) set = all.filter((o) => set.some((s) => s.cells.some((c) => o.cells.includes(c))));
      return set;
    };
    let best: { grid: Grid; total: number } | null = null;
    const baseline = scoreFill(fillEntries(grid), ctx).total;
    for (const depth of [1, 2]) {
      const blank = cloneGrid(grid);
      for (const s of ring(depth)) for (const i of s.cells) if (!blank.locked[i]) blank.cells[i] = "";
      let unfillable = true;
      for (let t = 0; t < 3; t++) {
        for (const minScoreHere of [...new Set([minScore, floor])]) {
          const res = engine.fill(blank, { minScore: minScoreHere, rejected: [...banList, ...rejected, current] }, { timeoutMs: fillMs / 4, seed: Math.floor(random() * 2 ** 31) });
          if (!res.ok) continue;
          unfillable = false;
          const sc = scoreFill(fillEntries(res.grid), ctx);
          if (sc.banned.length || auditBlocks(res.grid).length) continue;
          if (sc.total > (best?.total ?? baseline)) best = { grid: res.grid, total: sc.total };
        }
      }
      if (!unfillable) break;
    }
    return best?.grid ?? null;
  };
  {
    let grid = cloneGrid(chosen.grid);
    const changes: string[] = [];
    for (const { s, text } of flaggedSlots(grid, chosen.score)) {
      if (slotText(grid, s) !== text) continue; // an earlier refill already changed it
      const next = localRefill(grid, s);
      if (!next) continue;
      const before = new Map(fillEntries(grid).map((e) => [e.slotId, e.answer]));
      const diff = fillEntries(next).filter((e) => before.get(e.slotId) !== e.answer).map((e) => `${e.slotId} ${before.get(e.slotId)} → ${e.answer}`);
      changes.push(`- ${s.id} ${text}: ${diff.join(", ")}`);
      log(`  local refill ${s.id} ${text}: ${diff.join(", ")}`);
      grid = next;
    }
    notes.push("## Local refills", `Each flagged entry rejected and its neighborhood refilled at ${minScore}, kept when the fill scored better:`, ...(changes.length ? changes : ["- none improved the fill"]), "");
    if (changes.length) chosen = candidate(grid, chosen.seed);
  }

  if (useLlm) {
    // In-place swaps: for every flagged entry, the alternatives the engine lists for that slot with
    // the crossings as they stand, at the requested score first and the floor second.
    const grid = cloneGrid(chosen.grid);
    const offers: SwapOffer[] = [];
    for (const { s, text } of flaggedSlots(grid, chosen.score)) {
      const blank = cloneGrid(grid);
      for (const i of s.cells) if (!blank.locked[i]) blank.cells[i] = "";
      const fits = (c: { word: string; score: number }) => c.word !== text && !ban.has(c.word) && !rejected.has(c.word) && !swapIsClean(grid, s, c.word);
      let candidates = (engine.options(blank, { minScore, rejected: [...banList, ...rejected] }, s.id, 60).words ?? []).filter(fits);
      if (!candidates.length && floor < minScore) candidates = (engine.options(blank, rules(), s.id, 60).words ?? []).filter(fits);
      if (candidates.length) offers.push({ slot: s, current: text, candidates: candidates.slice(0, 12) });
    }
    if (offers.length) {
      log(`Offering swaps for ${offers.map((o) => `${o.slot.id} ${o.current}`).join(", ")}…`);
      const swaps = await chooseSwaps(grid, offers, context);
      notes.push("## Swaps", ...offers.map((o) => `- ${o.slot.id} ${o.current}: engine offered ${o.candidates.map((c) => c.word).join(", ")}`));
      let changed = false;
      for (const sw of swaps) {
        const offer = offers.find((o) => o.slot.id === sw.slot);
        const word = normalizeEntry(sw.word);
        if (!offer || !word || word === "KEEP" || word === offer.current) {
          if (offer) notes.push(`- ${offer.slot.id}: kept ${offer.current} (${sw.reason})`);
          continue;
        }
        if (!offer.candidates.some((c) => c.word === word)) {
          notes.push(`- ${offer.slot.id}: ${word} was not among the engine's candidates; kept ${offer.current}`);
          continue;
        }
        const problem = swapIsClean(grid, offer.slot, word);
        if (problem) {
          notes.push(`- ${offer.slot.id}: ${word} ${problem}; kept ${offer.current}`);
          continue;
        }
        offer.slot.cells.forEach((cell, i) => (grid.cells[cell] = word[i]));
        changed = true;
        notes.push(`- ${offer.slot.id}: ${offer.current} → **${word}** (${sw.reason})`);
        log(`  ${offer.slot.id}: ${offer.current} → ${word}`);
      }
      notes.push("");
      if (changed) chosen = candidate(grid, chosen.seed);
    } else {
      notes.push("## Swaps", "No flagged entry had an engine-approved alternative that fits its crossings as they stand.", "");
    }
  }

  // The fill that ships always gets a review: audit refills, local refills and swaps happened after
  // the last round. "Must" entries at this point are recorded for the editor, not silently kept.
  const reviewed = (): { key: string; clean: boolean } | null => lastReviewed; // assigned in a closure, so read through one
  const last = reviewed();
  if (useLlm && !(last && last.key === chosen.grid.cells.join("") && last.clean)) {
    const must = await reviewRound([chosen], "closing");
    if (must.length) {
      leftForEditor.push(...must);
      notes.push(`Left in the grid for the editor to replace in the studio: ${must.join(", ")}.`, "");
      log(`  left for the editor: ${must.join(", ")}`);
    }
  }

  // 5. Final fill and audit.
  const grid = chosen.grid;
  const finalScore = scoreFill(fillEntries(grid), ctx);
  const finalBlocks = auditBlocks(grid);
  if (finalScore.banned.length || finalBlocks.length) {
    const error = finalScore.banned.length ? `Final fill contains banned words: ${finalScore.banned.join(", ")}` : `Final fill has audit blocks: ${finalBlocks.join(", ")}`;
    console.error(`✗ ${error}`);
    return outcome({ ok: false, stage: "review", error, floor });
  }
  const report = auditGrid(grid, index, MAX_SHARED);
  notes.push("## Final fill", "```", ...gridToRows(grid), "```", `Quality ${finalScore.total.toFixed(0)}, mean score ${finalScore.mean.toFixed(1)}.`, "", "## Audit");
  notes.push(...(report.issues.length ? report.issues.map((i) => `- [${i.severity}] ${i.message}`) : ["- clean"]), "");
  const weakest = report.entries.filter((e) => !e.locked).sort((a, b) => a.score - b.score).slice(0, 8);
  notes.push(`Lowest-scored entries: ${weakest.map((e) => `${e.answer} (${e.score})`).join(", ")}`, "");
  const stillThere = new Set(fillEntries(grid).map((e) => e.answer));
  leftForEditor.splice(0, leftForEditor.length, ...leftForEditor.filter((w) => stillThere.has(w)));
  const editorFlags = [...leftForEditor.map((w) => `${w} (Claude: must replace)`), ...finalScore.weak.filter((w) => !leftForEditor.includes(w.answer)).map((w) => `${w.answer} (${w.reasons.join(", ")})`)];
  if (editorFlags.length) notes.push(`Flagged for the editor: ${editorFlags.join(", ")}`, "");

  // 6. Clues.
  stage = "clues";
  const clues: Record<string, ClueSet> = {};
  const answers = Object.fromEntries(slotsOf(grid).map((s) => [s.id, slotText(grid, s)]));
  if (useLlm) {
    log("Writing clues…");
    const sketches = Object.entries(spec.clueSketches ?? {}).filter(([a]) => seeds.includes(a));
    const clueContext = `${context}
Clue every theme entry (${seeds.join(", ")}) as a question-mark pun that plays on the mashup, e.g. TOUCHDOWNUNDER → "Six points scored in Australia?". The speed clue for a theme entry may be plainer.
Content rule, same standard as the fill: nothing crude, sad or gross, no mockery of a dialect, accent or group ("in broken English" is out), nothing that needs a trigger warning. Clue a weak entry straight rather than by apologizing for it.${sketches.length ? `\nClue sketches from the constructor (polish them, keep the idea): ${sketches.map(([a, c]) => `${a}: ${c}`).join("; ")}` : ""}`;
    let rows = await writeClues(grid, clueContext, difficulty);
    for (let pass = 0; pass < 2; pass++) {
      for (const r of rows) if (answers[r.slot]) clues[r.slot] = { standard: r.standard.trim(), speed: r.speed.trim() };
      const problems = clueProblems(answers, clues);
      if (!problems.length) break;
      if (pass === 0) {
        log(`  fixing ${problems.length} clue(s)`);
        rows = await writeClues(grid, clueContext, difficulty, problems);
      } else notes.push(`Clue problems left after the fix pass: ${problems.map((p) => `${p.slot} (${p.problem})`).join("; ")}`, "");
    }
    // A second look at content and fairness, not mechanics: the fix pass rewrites what it flags.
    log("Reviewing clues…");
    const content = await reviewClues(grid, clueContext, answers, clues);
    notes.push("## Clue review", ...(content.length ? content.map((p) => `- ${p.slot} ${answers[p.slot]}: ${p.problem}`) : ["- nothing flagged"]), "");
    if (content.length) {
      log(`  rewriting ${content.length} clue(s) for content`);
      const rows = await writeClues(grid, clueContext, difficulty, content);
      for (const r of rows) if (answers[r.slot] && content.some((p) => p.slot === r.slot)) clues[r.slot] = { standard: r.standard.trim(), speed: r.speed.trim() };
      const left = clueProblems(answers, clues);
      if (left.length) notes.push(`Mechanical problems after the content rewrite: ${left.map((p) => `${p.slot} (${p.problem})`).join("; ")}`, "");
    }
    const list = Object.entries(clues).map(([id, c]) => ({ slotId: id, answer: answers[id], clue: c.standard }));
    notes.push("## Clues", `Difficulty ${difficulty}. Budget: ${list.reduce((n, e) => n + e.clue.length, 0)} / ${clueBudget(list.length)} characters.`, "");
    notes.push(...auditClues(list, "standard clue").map((i) => `- [${i.severity}] ${i.message}`));
    notes.push("| Slot | Answer | Standard | Speed |", "|---|---|---|---|");
    for (const s of slotsOf(grid)) {
      const c = clues[s.id];
      notes.push(`| ${s.id} | ${answers[s.id]}${seeds.includes(answers[s.id]) ? " (theme)" : ""} | ${c?.standard ?? ""} | ${c?.speed ?? ""} |`);
    }
    notes.push("");
  }

  // 7. Output.
  stage = "output";
  title ||= theme || "Untitled";
  const outDir = path.join(outRoot, `${today()}-${slug}`);
  fs.mkdirSync(outDir, { recursive: true });
  const ipuz = toIpuz(grid, clues, { title, author: spec.author ?? "Crossword Clash", theme: theme || undefined });
  fs.writeFileSync(path.join(outDir, "puzzle.ipuz"), JSON.stringify(ipuz, null, 2) + "\n");
  const studio: StudioState = {
    id: newPuzzleId(),
    grid,
    symmetry: "rotational",
    minScore: floor,
    approved: {},
    rejected: [...rejected],
    cursor: 0,
    dir: "across",
    clues: Object.fromEntries(slotsOf(grid).filter((s) => clues[s.id]).map((s) => [slotKey(s), clues[s.id].standard])),
    speedClues: Object.fromEntries(slotsOf(grid).filter((s) => clues[s.id]?.speed).map((s) => [slotKey(s), clues[s.id].speed!])),
    editedClues: [],
    title,
    theme,
    difficulty,
    versions: [],
  };
  fs.writeFileSync(path.join(outDir, "studio.json"), JSON.stringify(studio, null, 2) + "\n");
  const header = [
    `# ${title}`,
    "",
    theme || "(no theme given)",
    "",
    `${size}×${size}, rotational symmetry, requested score ${minScore}, filled at floor ${floor}, model ${useLlm ? model : "none"}, ${fmtSeconds(Date.now() - startedAt)}, tokens ${usage.input} in / ${usage.output} out`,
    "",
  ];
  fs.writeFileSync(path.join(outDir, "review.md"), [...header, ...notes].join("\n") + "\n");
  const rel = path.relative(process.cwd(), outDir);
  log("");
  log(gridToRows(grid).join("\n"));
  log(`→ ${rel}/puzzle.ipuz, review.md, studio.json`);
  log(`  publish: pnpm daily:add YYYY-MM-DD ${rel}/puzzle.ipuz "${title}"`);
  if (leftForEditor.length) log(`  left for the editor: ${leftForEditor.join(", ")}`);
  return outcome({ ok: true, stage: "done", floor, quality: finalScore.total, weak: [...new Set([...leftForEditor, ...finalScore.weak.map((w) => w.answer)])], dir: rel });
}

// ---- Entry point ----
async function main() {
  const batchFile = flag("batch");
  const specs = batchFile ? specsFromFile(batchFile) : specsFromFlags();
  const outcomes: ThemeOutcome[] = [];
  for (const spec of specs) {
    try {
      outcomes.push(await buildTheme(spec));
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`✗ ${spec.theme || spec.seeds.join(", ")}: ${error}`);
      outcomes.push({ theme: spec.theme, title: spec.title ?? "", ok: false, stage, error, ms: 0 });
    }
  }
  if (useLlm && !dryRun) log(`tokens: ${usage.input} in / ${usage.output} out`);
  if (batchFile) {
    const rows = [
      "| Theme | Title | Result | Floor | Quality | Weak entries | Output | Time |",
      "|---|---|---|---|---|---|---|---|",
      ...outcomes.map((o) =>
        `| ${o.theme} | ${o.title} | ${o.ok ? (o.stage === "skeleton" ? "skeleton (dry run)" : "done") : `failed at ${o.stage}: ${(o.error ?? "").split("\n")[0]}`} | ${o.floor ?? ""} | ${o.quality?.toFixed(0) ?? ""} | ${o.weak?.join(", ") ?? ""} | ${o.dir ?? ""} | ${fmtSeconds(o.ms)} |`,
      ),
    ];
    fs.mkdirSync(outRoot, { recursive: true });
    const summary = path.join(outRoot, `${today()}-batch-${themeSlug(path.basename(batchFile).replace(/\.[^.]+$/, ""))}.md`);
    fs.writeFileSync(summary, [`# Batch ${path.basename(batchFile)}`, "", ...rows, ""].join("\n"));
    log("");
    log(rows.join("\n"));
    log(`→ ${path.relative(process.cwd(), summary)}`);
  }
  process.exitCode = outcomes.every((o) => o.ok) ? 0 : 1;
}

await main();
