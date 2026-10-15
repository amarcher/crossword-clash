/**
 * Review checks for a filled grid, after Ingrid's review tab: possible
 * duplicates, the weakest entries, corners where niche entries pile up,
 * abbreviations crossing abbreviations, and the clue character budget.
 */
import type { WordIndex } from "./dictionary";
import { crossingsOf, slotsOf, slotText, type Grid } from "./grid";

export interface AuditEntry {
  slotId: string;
  answer: string;
  score: number;
  tags: string;
  /** Proper noun, slang, abbreviation, or scored 49 or below. */
  niche: boolean;
  locked: boolean;
}

export interface AuditIssue {
  kind: "duplicate" | "pileup" | "abbreviation-cross" | "niche-cross" | "clue-length" | "clue-budget" | "clue-answer";
  severity: "block" | "warn";
  slots: string[];
  message: string;
}

export interface AuditReport {
  entries: AuditEntry[];
  issues: AuditIssue[];
}

export const NICHE_TAGS = /[pas]/;

function longestSharedRun(a: string, b: string): string {
  let best = "";
  for (let i = 0; i < a.length; i++) {
    for (let j = i + best.length + 1; j <= a.length; j++) {
      const sub = a.slice(i, j);
      if (b.includes(sub)) best = sub;
      else break;
    }
  }
  return best;
}

export function auditGrid(grid: Grid, index: WordIndex, maxShared = 4): AuditReport {
  const slots = slotsOf(grid);
  const crossings = crossingsOf(slots);
  const entries: AuditEntry[] = slots.map((s) => {
    const answer = slotText(grid, s);
    const locked = s.cells.every((i) => grid.locked[i]);
    const found = index.entry(answer);
    const score = locked ? 100 : found?.score ?? 0;
    const tags = found?.tags ?? "";
    return { slotId: s.id, answer, score, tags, locked, niche: !locked && (score <= 49 || NICHE_TAGS.test(tags)) };
  });
  const issues: AuditIssue[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.locked && b.locked) continue;
      const [short, long] = a.answer.length <= b.answer.length ? [a, b] : [b, a];
      const run = longestSharedRun(short.answer, long.answer);
      const inside = long.answer.includes(short.answer);
      if (inside || run.length >= maxShared) {
        issues.push({
          kind: "duplicate",
          severity: inside || run.length > maxShared ? "block" : "warn",
          slots: [a.slotId, b.slotId],
          message: inside ? `${short.answer} is inside ${long.answer}` : `${a.answer} and ${b.answer} share ${run}`,
        });
      }
    }
  }

  const seen = new Set<string>();
  crossings.forEach((list, si) => {
    for (const c of list) {
      const a = entries[si];
      const b = entries[c.other];
      const key = [si, c.other].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      if (a.tags.includes("a") && b.tags.includes("a")) {
        issues.push({ kind: "abbreviation-cross", severity: "warn", slots: [a.slotId, b.slotId], message: `Abbreviation ${a.answer} crosses abbreviation ${b.answer}` });
      } else if (a.niche && b.niche) {
        issues.push({ kind: "niche-cross", severity: "warn", slots: [a.slotId, b.slotId], message: `${a.answer} crosses ${b.answer}; both niche` });
      }
    }
  });

  // Pile-ups: three or more niche entries meeting inside one 4×4 (3×3 on small grids) window.
  const win = Math.min(grid.width, grid.height) <= 7 ? 3 : 4;
  const flagged = new Set<string>();
  for (let r = 0; r + win <= grid.height; r++) {
    for (let c = 0; c + win <= grid.width; c++) {
      const inWindow = new Set<number>();
      for (let dr = 0; dr < win; dr++) for (let dc = 0; dc < win; dc++) inWindow.add((r + dr) * grid.width + c + dc);
      const niche = slots
        .map((s, si) => ({ s, e: entries[si] }))
        .filter(({ s, e }) => e.niche && s.cells.some((i) => inWindow.has(i)))
        .map(({ e }) => e.slotId);
      const key = niche.sort().join(",");
      if (niche.length >= 3 && !flagged.has(key)) {
        flagged.add(key);
        issues.push({ kind: "pileup", severity: "warn", slots: niche, message: `Niche pile-up near row ${r + 1}, column ${c + 1}: ${niche.map((id) => entries.find((e) => e.slotId === id)!.answer).join(", ")}` });
      }
    }
  }

  return { entries, issues };
}

export const CLUE_MAX = 41;

/** A per-puzzle budget scaled from the 1,600 characters some outlets allow a 15×15. */
export function clueBudget(entryCount: number): number {
  return Math.round((1600 / 78) * entryCount);
}

/** True if the answer, or a run of clue words spelling it, appears in the clue ("Hat tip" for HATTIP). */
export function clueGivesAway(clue: string, answer: string): boolean {
  const words = clue.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    let joined = "";
    for (let j = i; j < Math.min(words.length, i + 4); j++) {
      joined += words[j];
      if (joined === answer || (j === i && answer.length >= 4 && joined.startsWith(answer))) return true;
    }
  }
  return false;
}

export function auditClues(entries: { slotId: string; answer: string; clue: string }[], label = "clue"): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const e of entries) {
    if (e.clue.length > CLUE_MAX) {
      issues.push({ kind: "clue-length", severity: "block", slots: [e.slotId], message: `${e.slotId} ${label} is ${e.clue.length} characters (max ${CLUE_MAX})` });
    }
    if (clueGivesAway(e.clue, e.answer)) {
      issues.push({ kind: "clue-answer", severity: "block", slots: [e.slotId], message: `${e.slotId} ${label} contains its answer ${e.answer}` });
    }
  }
  const total = entries.reduce((n, e) => n + e.clue.length, 0);
  const budget = clueBudget(entries.length);
  if (total > budget) {
    issues.push({ kind: "clue-budget", severity: "warn", slots: [], message: `${label}s total ${total} characters (budget ${budget})` });
  }
  return issues;
}
