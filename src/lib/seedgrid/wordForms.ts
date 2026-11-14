/**
 * Two fill rules a Spanish grid needs and an English one barely does
 * (docs/spanish-puzzles-spec.md §5.2; the spike of 2026-11-13 shipped OIR,
 * OIA and OIDO in one 15×15, and about fifteen conjugated verbs):
 *
 * - **same root**: no two entries that are forms of one lemma (OSO / OSA,
 *   AMAS / AMABAS);
 * - **conjugation budget**: only so many finite verb forms per grid. An
 *   infinitive, a participle or a gerund reads as a word; PUSO and IRE read
 *   as fill.
 *
 * Both read a word list's forms sidecar (`WORD<tab>tag<tab>lemmas<tab>spellings`,
 * written by scripts/seedgrid/es/build_dict.py; a lemma ending in "?" is a
 * verb the noun could also be read as). A list without one (the
 * English lists) gives no lookup, and both rules then report nothing.
 */
import { gridSpelling } from "../gridLetters";

export type FormTag = "inf" | "part" | "ger" | "finite" | "noun-adj" | "name" | "other";

const FORM_TAGS: ReadonlySet<string> = new Set(["inf", "part", "ger", "finite", "noun-adj", "name", "other"]);

export interface WordForm {
  /**
   * What the entry is at best: a word that is a noun as well as a verb form
   * (CANTO) is "noun-adj", since it can be clued as the noun.
   */
  tag: FormTag;
  /** The lemmas the entry is a form of, in grid spelling (OIA → OIR; OSA → OSA, OSO). */
  lemmas: string[];
  /**
   * Verbs a noun or adjective could also be read as a form of (ARO → ARAR,
   * "I plough"; CANTO → CANTAR). Whether that reading is in play is the
   * clue's business, so a link through one is a question, not a fault.
   */
  maybeLemmas: string[];
  /** The entry as it is written outside a grid, accents included (IRÉ; ALEGRO and ALEGRÓ). */
  spellings: string[];
}

export type FormLookup = (entry: string) => WordForm | undefined;

/** The forms sidecar as a lookup by grid spelling. Malformed lines are skipped. */
export function parseForms(text: string): Map<string, WordForm> {
  const out = new Map<string, WordForm>();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [rawWord, tag, lemmas = "", spellings = ""] = line.split("\t");
    const word = gridSpelling(rawWord ?? "");
    if (!word || !FORM_TAGS.has(tag)) continue;
    const list = (field: string) => field.split(",").map((s) => s.trim()).filter(Boolean);
    const all = list(lemmas);
    out.set(word, {
      tag: tag as FormTag,
      lemmas: all.filter((l) => !l.endsWith("?")).map(gridSpelling),
      maybeLemmas: all.filter((l) => l.endsWith("?")).map(gridSpelling),
      spellings: list(spellings),
    });
  }
  return out;
}

export interface SameRootGroup {
  lemma: string;
  /** Two or more different entries of the grid that are forms of `lemma`, in the order given. */
  entries: string[];
  /**
   * True when at least two of the entries are forms of the lemma outright
   * (OIR / OIA, OSO / OSA): a fault. False when the group only holds together
   * through a noun's possible verb reading (ARO / ARAR, AMAS / AMABAS): the
   * editor judges it by the clues.
   */
  certain: boolean;
}

/**
 * Entries that are forms of one lemma. Each group is reported once, certain
 * groups first, then under the lemma that gathers the most entries; a group
 * contained in another is dropped (OSO / OSA is one finding, though the two
 * also share OSAR).
 */
export function sameRootGroups(entries: string[], lookup: FormLookup | undefined): SameRootGroup[] {
  if (!lookup) return [];
  const byLemma = new Map<string, { entries: string[]; sure: number }>();
  for (const entry of new Set(entries)) {
    const form = lookup(entry);
    if (!form) continue;
    const sure = new Set(form.lemmas);
    for (const lemma of new Set([...form.lemmas, ...form.maybeLemmas])) {
      const group = byLemma.get(lemma) ?? { entries: [], sure: 0 };
      group.entries.push(entry);
      if (sure.has(lemma)) group.sure++;
      byLemma.set(lemma, group);
    }
  }
  const groups = [...byLemma]
    .filter(([, g]) => g.entries.length > 1)
    .map(([lemma, g]) => ({ lemma, entries: g.entries, certain: g.sure > 1 }))
    .sort((a, b) => Number(b.certain) - Number(a.certain) || b.entries.length - a.entries.length || (a.lemma < b.lemma ? -1 : 1));
  const kept: SameRootGroup[] = [];
  for (const group of groups) {
    if (kept.some((k) => group.entries.every((e) => k.entries.includes(e)))) continue;
    kept.push(group);
  }
  return kept;
}

/** Finite verb forms allowed in one grid, by daily slot. Proposed 2026-11-13; the reviewer may move them. */
export const CONJUGATION_BUDGET = { mini: 1, midi: 3, plus: 4, large: 6 } as const;

/** The budget for a grid of this width: up to 7 a mini, up to 10 a midi, up to 12 the Daily Plus, else a large. */
export function conjugationBudgetFor(width: number): number {
  if (width <= 7) return CONJUGATION_BUDGET.mini;
  if (width <= 10) return CONJUGATION_BUDGET.midi;
  if (width <= 12) return CONJUGATION_BUDGET.plus;
  return CONJUGATION_BUDGET.large;
}

/** The entries that can only be read as a conjugated verb (never an infinitive, participle, gerund, noun or name). */
export function finiteForms(entries: string[], lookup: FormLookup | undefined): string[] {
  if (!lookup) return [];
  return [...new Set(entries)].filter((entry) => lookup(entry)?.tag === "finite");
}

export interface ConjugationProblem {
  count: number;
  limit: number;
  forms: string[];
}

/** Null while the grid is within its budget of finite verb forms. */
export function conjugationProblem(entries: string[], lookup: FormLookup | undefined, limit: number): ConjugationProblem | null {
  const forms = finiteForms(entries, lookup);
  return forms.length > limit ? { count: forms.length, limit, forms } : null;
}
