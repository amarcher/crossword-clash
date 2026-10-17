/**
 * Clue-writing prompts and checks shared by the CLI (`pnpm seedgrid`) and the
 * studio. Pure: callers send the request through their own Claude client
 * (scripts/seedgrid/claude.mts, or the studio-claude edge function).
 */
import { auditClues, CLUE_MAX } from "./audit";
import { gridToRows, slotsOf, slotText, type Grid } from "./grid";

export const CONSTRUCTOR = `You are a veteran American crossword constructor and editor in the style of William Eisenberg working in Ingrid.
You care about fill with soul: in-the-language phrases, fresh vocabulary, fair crossings. You dislike crosswordese (ESNE, ALAI, ERNE), partials, awkward plurals, obscure abbreviations, Roman numerals, and corners where niche names pile up. Prefer real words over abbreviations. Keep everything family friendly and avoid sad or gross entries.
The puzzles are for Crossword Clash, a fast multiplayer game: solvers race, so instant recognizability matters.`;

/** A structured-output request, in the shape both Claude clients accept. */
export interface ClaudeJsonRequest {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export type Difficulty = "easy" | "medium" | "hard";

const STANDARD_STYLE: Record<Difficulty, string> = {
  easy: "straightforward, Monday difficulty: a clear definition or a friendly fill-in-the-blank, with a light touch of fun",
  medium: "clever, mid-week difficulty (think a Wednesday): misdirection, wordplay, and fresh angles welcome, but always fair",
  hard: "tricky, Saturday difficulty: oblique definitions, misdirection and question-mark wordplay, still fair with the crossings",
};

export interface ClueRow {
  slot: string;
  standard: string;
  speed: string;
}

const RULES = `- Each clue at most ${CLUE_MAX} characters. Shorter is better: players read under time pressure.
- Never use the answer or any of its words in its clue. Mark fill-in-the-blank with ___ . Signal abbreviations and foreign words the standard way.
- Write original clues; do not reuse famous published ones.`;

function header(grid: Grid, context: string): string {
  return `${context.trim() ? `${context.trim()}\n` : ""}Grid:\n${gridToRows(grid).join("\n")}`;
}

/** Two clues (standard + speed) for each listed slot; `fix` names earlier problems to correct. */
export function cluesRequest(
  grid: Grid,
  context: string,
  opts: { slots?: string[]; difficulty?: Difficulty; fix?: { slot: string; problem: string }[] } = {},
): ClaudeJsonRequest {
  const wanted = new Set(opts.slots ?? opts.fix?.map((f) => f.slot) ?? slotsOf(grid).map((s) => s.id));
  const slots = slotsOf(grid).filter((s) => wanted.has(s.id));
  const fix = opts.fix?.length ? `\nThese clues were rejected; fix the problems:\n${opts.fix.map((f) => `${f.slot}: ${f.problem}`).join("\n")}\n` : "";
  return {
    system: CONSTRUCTOR,
    prompt: `${header(grid, context)}

Write two clues for every entry below.
- standard: ${STANDARD_STYLE[opts.difficulty ?? "medium"]}. Theme entries may nod to the theme.
- speed: plain and instantly gettable; used as a hint in a race.
${RULES}
${fix}
${slots.map((s) => `${s.id} ${slotText(grid, s)}`).join("\n")}`,
    schema: {
      type: "object",
      properties: {
        clues: {
          type: "array",
          items: {
            type: "object",
            properties: { slot: { type: "string" }, standard: { type: "string" }, speed: { type: "string" } },
            required: ["slot", "standard", "speed"],
          },
        },
      },
      required: ["clues"],
    },
    maxTokens: Math.min(16000, 1000 + slots.length * 120),
  };
}

/** Several different standard clues for one entry, so the constructor can pick. */
export function alternativesRequest(grid: Grid, context: string, slotId: string, opts: { count?: number; difficulty?: Difficulty; current?: string } = {}): ClaudeJsonRequest {
  const slot = slotsOf(grid).find((s) => s.id === slotId);
  const answer = slot ? slotText(grid, slot) : "";
  return {
    system: CONSTRUCTOR,
    prompt: `${header(grid, context)}

Write ${opts.count ?? 4} different clues for ${slotId} ${answer}, each taking a distinct angle (definition, wordplay, pop culture, fill-in-the-blank...).
Style: ${STANDARD_STYLE[opts.difficulty ?? "medium"]}.
${opts.current ? `The current clue is "${opts.current}"; do not repeat it.\n` : ""}${RULES}`,
    schema: {
      type: "object",
      properties: { clues: { type: "array", items: { type: "string" } } },
      required: ["clues"],
    },
    maxTokens: 1500,
  };
}

/** Blocking problems (too long, gives away the answer, missing) per slot, for a fix pass. */
export function clueProblems(answers: Record<string, string>, clues: Record<string, { standard: string; speed?: string }>): { slot: string; problem: string }[] {
  return Object.keys(answers).flatMap((id) => {
    const c = clues[id];
    if (!c?.standard) return [{ slot: id, problem: "missing" }];
    const issues = [
      ...auditClues([{ slotId: id, answer: answers[id], clue: c.standard }], "standard clue"),
      ...auditClues([{ slotId: id, answer: answers[id], clue: c.speed ?? "" }], "speed clue"),
    ].filter((i) => i.severity === "block");
    return issues.length ? [{ slot: id, problem: issues.map((i) => i.message).join("; ") }] : [];
  });
}

/** True when a single clue passes the blocking checks. */
export function clueOk(answer: string, clue: string): boolean {
  return !auditClues([{ slotId: "", answer, clue }]).some((i) => i.severity === "block");
}

/** The content standard every clue pass states to the writer and the reviewer. */
export const CONTENT_RULE = `Content rule, same standard as the fill: nothing crude, sad or gross, no mockery of a dialect, accent or group ("in broken English" is out), nothing that needs a trigger warning. Clue a weak entry straight rather than by apologizing for it.`;

/** How the writer should treat dated hooks (holidays, anniversaries, sports): a light touch, never forced. */
export function timelyContext(hooks: string): string {
  return `Timely hooks for the day this puzzle runs (use one only where an entry fits naturally; never force it, never more than a handful): ${hooks}`;
}

/**
 * The editor's second look at a drafted set: content and fairness, not
 * mechanics (`clueProblems` covers those). The answer is a list of flagged
 * slots for a fix pass.
 */
export function contentReviewRequest(grid: Grid, context: string, answers: Record<string, string>, clues: Record<string, { standard: string; speed?: string }>): ClaudeJsonRequest {
  return {
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
    maxTokens: 4000,
  };
}
