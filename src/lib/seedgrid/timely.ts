/**
 * Pure helpers for `pnpm seedgrid:timely` (scripts/seedgrid/timely.mts): the
 * request that offers a finished puzzle its publish date's hooks, and the vet
 * that keeps only rewrites the clue checks accept. No I/O, so the CLI stays a
 * thin orchestration layer.
 */
import { CLUE_MAX } from "./audit";
import { clueProblems, CONSTRUCTOR, type ClaudeJsonRequest } from "./cluePrompt";
import { slotsOf, slotText, type Grid } from "./grid";
import type { ClueSet } from "./ipuz";

/** `docs/daily-hooks.json`: publish day (YYYY-MM-DD) → a sentence or two of light, dated hooks. */
export type DailyHooks = Record<string, string>;

/** The hooks for a day, or undefined when the file has nothing (or only whitespace) for it. */
export function hooksFor(hooks: DailyHooks, date: string): string | undefined {
  const text = hooks[date]?.trim();
  return text ? text : undefined;
}

export interface Rewrite {
  slot: string;
  standard: string;
  speed: string;
  why: string;
}

export interface TimelyOptions {
  date: string;
  hooks: string;
  clues: Record<string, ClueSet>;
  /** Most rewrites Claude may propose (the vet enforces it again). */
  max: number;
  theme?: string;
  title?: string;
  /** Theme entries, whose clues are kept unless a hook genuinely improves them. */
  seeds?: string[];
}

/** Offers the day's hooks and asks for at most `max` rewrites, only where a hook is a natural fit. */
export function timelyRequest(grid: Grid, opts: TimelyOptions): ClaudeJsonRequest {
  const slots = slotsOf(grid);
  const lines = slots.map((s) => {
    const c = opts.clues[s.id];
    return `${s.id} ${slotText(grid, s)}: ${c?.standard ?? ""} / ${c?.speed ?? ""}`;
  });
  const seeds = opts.seeds?.filter(Boolean) ?? [];
  return {
    system: CONSTRUCTOR,
    prompt: `${opts.theme ? `Theme: ${opts.theme}\n` : ""}${opts.title ? `Title: ${opts.title}\n` : ""}${seeds.length ? `Theme entries (keep their clues unless a hook improves them): ${seeds.join(", ")}\n` : ""}
This puzzle runs on ${opts.date}. Timely hooks for that day: ${opts.hooks}

Below are the entries with their current standard and speed clues. Propose a rewrite ONLY for entries where one of the hooks gives a genuinely better, fair, fresh clue — a natural fit, never a stretch, never a political take, nothing sad or grim. At most ${opts.max} rewrites; zero is a fine answer. Keep the same difficulty register as the existing clues (they are written for a quick daily solve). Each standard clue at most ${CLUE_MAX} characters; the speed clue stays plain and instantly gettable. Never use a word from the answer in its clue.

${lines.join("\n")}`,
    schema: {
      type: "object",
      properties: {
        rewrites: {
          type: "array",
          items: {
            type: "object",
            properties: { slot: { type: "string" }, standard: { type: "string" }, speed: { type: "string" }, why: { type: "string" } },
            required: ["slot", "standard", "speed", "why"],
          },
        },
      },
      required: ["rewrites"],
    },
    maxTokens: 4000,
  };
}

export interface VettedRewrites {
  accepted: Rewrite[];
  /** Slot → why the rewrite was refused (unknown slot, a clue check it failed). */
  rejected: { slot: string; reason: string }[];
}

/**
 * Keeps the first `max` rewrites that name a real slot and pass the blocking
 * clue checks (`clueProblems`: length and answer given away, both tiers); a
 * slot proposed twice is taken once.
 */
export function vetRewrites(answers: Record<string, string>, rewrites: Rewrite[], max: number): VettedRewrites {
  const accepted: Rewrite[] = [];
  const rejected: { slot: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const raw of rewrites) {
    if (accepted.length >= max) break;
    const r = { ...raw, standard: raw.standard.trim(), speed: raw.speed.trim() };
    if (!answers[r.slot]) {
      rejected.push({ slot: r.slot, reason: "not a slot in this puzzle" });
      continue;
    }
    if (seen.has(r.slot)) {
      rejected.push({ slot: r.slot, reason: "proposed twice" });
      continue;
    }
    seen.add(r.slot);
    const problems = clueProblems({ [r.slot]: answers[r.slot] }, { [r.slot]: { standard: r.standard, speed: r.speed } });
    if (problems.length) rejected.push({ slot: r.slot, reason: problems.map((p) => p.problem).join("; ") });
    else accepted.push(r);
  }
  return { accepted, rejected };
}

/** The clue set with the accepted rewrites applied. */
export function applyRewrites(clues: Record<string, ClueSet>, accepted: Rewrite[]): Record<string, ClueSet> {
  const out = { ...clues };
  for (const r of accepted) out[r.slot] = { standard: r.standard, speed: r.speed };
  return out;
}
