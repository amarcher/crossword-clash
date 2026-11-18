/**
 * Does each clue fit its own answer? (Andrew, 2026-11-16: the Midi for that
 * day shipped with seven across clues one entry early, "Talking tree of
 * Middle-earth" on IKE. Its clue list had none for GIL and two for NYT, so
 * the counts matched and nothing mechanical could tell.)
 *
 * The check is an editor's read by the model (`pnpm seedgrid:fitcheck`), and
 * a pass is recorded in a ledger (scripts/seedgrid/fit-ledger.json) under a
 * fingerprint of the puzzle's answers and clues. feedFit.test.ts holds the
 * feed to it from FIT_FROM on: a daily whose clues have not passed, or have
 * changed since they did, fails CI until it is checked again.
 */
import type { ClaudeJsonRequest } from "./cluePrompt";
import type { ClueUse } from "./crosscheck";

/** The first day the ledger is enforced for: the feed's first day, so the archive is held to it too. */
export const FIT_FROM = "2026-10-16";

/** "day/slot" → fingerprint of the clues that passed. */
export type FitLedger = Record<string, string>;

export const fitKey = (day: string, slot: string): string => `${day}/${slot}`;

function fnv(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A fingerprint of every answer with its clue, in order: any change to either asks for a new check. */
export function fitFingerprint(uses: readonly Pick<ClueUse, "dir" | "number" | "answer" | "clue">[]): string {
  const text = uses.map((u) => `${u.dir[0]}${u.number}\t${u.answer}\t${u.clue}`).join("\n");
  return fnv(text, 0x811c9dc5) + fnv(text, 0x9747b28c);
}

export interface FitProblem {
  /** "22A", "3D". */
  id: string;
  problem: string;
}

/** The editor's read of one puzzle: which clues do not clue their own answer. */
export function fitRequest(title: string, uses: readonly Pick<ClueUse, "dir" | "number" | "answer" | "clue">[]): ClaudeJsonRequest {
  return {
    system:
      "You are a meticulous American crossword test-solver checking a finished puzzle before it is published. You check one thing: that every clue is a correct, fair clue for the answer printed beside it.",
    prompt: `Puzzle: ${title}

Each line is an entry's id, its ANSWER, and its clue. For every line, decide whether the clue really leads to that exact answer.

Flag a line when:
- the clue defines a different word, above all another entry of this puzzle (a clue list that slipped by one puts each clue on its neighbour);
- the clue defines a word spelled differently from the answer (a clue for GILL beside the answer GIL);
- the answer's number, tense or part of speech does not match the clue;
- the clue states something factually wrong;
- two entries carry clues for the same answer, or an entry's clue is plainly missing.

Do not flag style, difficulty, wordplay that works, or a clue you would merely have written differently. An empty list is the expected answer for a sound puzzle.

${uses.map((u) => `${u.number}${u.dir === "across" ? "A" : "D"}  ${u.answer}  —  ${u.clue}`).join("\n")}`,
    schema: {
      type: "object",
      properties: {
        problems: { type: "array", items: { type: "object", properties: { id: { type: "string" }, problem: { type: "string" } }, required: ["id", "problem"] } },
      },
      required: ["problems"],
    },
    maxTokens: 4000,
  };
}

/** The feed's days from FIT_FROM on whose clues have no pass on record, or have changed since. */
export function unfit(ledger: FitLedger, files: readonly { day: string; slot: string; uses: readonly ClueUse[] }[], from: string = FIT_FROM): string[] {
  return files.filter((f) => f.day >= from && ledger[fitKey(f.day, f.slot)] !== fitFingerprint(f.uses)).map((f) => fitKey(f.day, f.slot));
}
