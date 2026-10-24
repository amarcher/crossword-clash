/**
 * Studio → Claude, through the token-gated studio-claude edge function. Prompts
 * come from cluePrompt.ts (shared with the CLI), and drafts get the same
 * checks and one fix pass as `pnpm seedgrid`.
 */
import { alternativesRequest, clueOk, clueProblems, cluesRequest, type ClaudeJsonRequest, type ClueRow, type Difficulty } from "./cluePrompt";
import { slotsOf, slotText, type Grid } from "./grid";
import { studioHeaders } from "../studioAuth";

export const STUDIO_TOKEN_KEY = "crossword-clash:studio-token";

export class StudioClaudeError extends Error {
  readonly kind: "config" | "token" | "budget" | "allowance" | "rate" | "failed";
  /** For `allowance`: when the monthly drafting allowance resets (ISO). */
  readonly resetsAt?: string;
  constructor(kind: StudioClaudeError["kind"], message: string, resetsAt?: string) {
    super(message);
    this.kind = kind;
    this.resetsAt = resetsAt;
  }
}

/** The error a 402 from studio-claude means: a subscriber's spent allowance, or the shared budget. */
export function studioRefusal(body: unknown): StudioClaudeError {
  const b = (body ?? {}) as { error?: string; resetsAt?: string };
  if (b.error === "allowance_exhausted") {
    const when = b.resetsAt ? new Date(b.resetsAt) : null;
    const day = when && !Number.isNaN(when.getTime()) ? when.toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "the 1st";
    return new StudioClaudeError("allowance", `Your monthly drafting allowance is used up. It resets on ${day}.`, b.resetsAt);
  }
  return new StudioClaudeError("budget", "This month's AI budget is used up.");
}

export type ClaudeCaller = <T>(req: ClaudeJsonRequest) => Promise<T>;

/** Calls the edge function as the signed-in admin and/or with the studio token. */
export function edgeCaller(token: string): ClaudeCaller {
  return async <T,>(req: ClaudeJsonRequest): Promise<T> => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key) throw new StudioClaudeError("config", "Supabase isn't configured in this build.");
    const res = await fetch(`${url}/functions/v1/studio-claude`, {
      method: "POST",
      headers: await studioHeaders(token),
      body: JSON.stringify(req),
    });
    if (res.status === 401) throw new StudioClaudeError("token", "Sign in as a studio admin, or enter the studio token.");
    if (res.status === 402) throw studioRefusal(await res.json().catch(() => null));
    if (res.status === 429) throw new StudioClaudeError("rate", "Too many Claude requests this hour. Try again later.");
    const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok || body.result === undefined) throw new StudioClaudeError("failed", `Claude request failed (${body.error ?? res.status}).`);
    return body.result;
  };
}

/** Answers of every complete entry, by slot id. */
export function entryAnswers(grid: Grid): Record<string, string> {
  return Object.fromEntries(
    slotsOf(grid)
      .map((s) => [s.id, slotText(grid, s)] as const)
      .filter(([, text]) => !text.includes(".")),
  );
}

/**
 * Standard + speed clues for `slots` (default: every entry). Clues that fail the
 * blocking checks get one fix request; any still failing are left out.
 */
export async function draftClues(
  call: ClaudeCaller,
  grid: Grid,
  context: string,
  opts: { slots?: string[]; difficulty?: Difficulty } = {},
): Promise<Record<string, { standard: string; speed: string }>> {
  const answers = entryAnswers(grid);
  const wanted = (opts.slots ?? Object.keys(answers)).filter((id) => answers[id]);
  const out: Record<string, { standard: string; speed: string }> = {};
  const take = (rows: ClueRow[]) => {
    for (const r of rows) if (wanted.includes(r.slot)) out[r.slot] = { standard: r.standard.trim(), speed: r.speed.trim() };
  };
  take((await call<{ clues: ClueRow[] }>(cluesRequest(grid, context, { slots: wanted, difficulty: opts.difficulty }))).clues);
  const problems = clueProblems(Object.fromEntries(wanted.map((id) => [id, answers[id]])), out);
  if (problems.length) {
    take((await call<{ clues: ClueRow[] }>(cluesRequest(grid, context, { fix: problems, difficulty: opts.difficulty }))).clues);
    for (const { slot } of clueProblems(Object.fromEntries(problems.map((p) => [p.slot, answers[p.slot]])), out)) delete out[slot];
  }
  return out;
}

/** A few alternative standard clues for one entry, keeping only ones that pass the checks. */
export async function suggestClues(
  call: ClaudeCaller,
  grid: Grid,
  context: string,
  slotId: string,
  opts: { difficulty?: Difficulty; current?: string } = {},
): Promise<string[]> {
  const answer = entryAnswers(grid)[slotId];
  if (!answer) return [];
  const { clues } = await call<{ clues: string[] }>(alternativesRequest(grid, context, slotId, opts));
  return [...new Set(clues.map((c) => c.trim()))].filter((c) => c && c !== opts.current && clueOk(answer, c));
}
