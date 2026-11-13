/**
 * Races and replays (docs/plus-expansion-spec.md §2): race someone's recorded
 * solve of the same puzzle, or watch it replayed. Plus only; an account
 * chooses who may (`race_visibility`: anyone, friends only, or hidden).
 *
 * A finished solo solve is recorded as events, `[ms, cell, letter]`: active
 * solving time in ms, the cell's index (row * width + col) and the letter
 * written ('' for an erase). Whoever races it plays the puzzle with the
 * recording ("the ghost") advancing on their own clock: the squares the
 * ghost had filled by then are tinted on the racer's grid, never with the
 * letters (the server strips them until the racer has finished; see
 * migration 20261112000000_friend_races.sql). Every race is Plus.
 *
 * The pure helpers (recording diffs, the ghost at a moment, outcomes) are
 * unit-tested in race.test.ts; storage and the RPC calls sit at the bottom.
 */
import type { CellState, Puzzle, PuzzleRef } from "../types/puzzle";
import { compareToChallenge, type ChallengeComparison } from "./challenge";
import { supabase } from "./supabaseClient";

/** `[ms, cell, letter]`; a stripped recording has 1 (filled) / 0 (emptied) instead of the letter. */
export type TraceEvent = [number, number, string | number];

/**
 * What a share replay (replayCode.ts) needs beyond the letters, kept with the
 * recording on this device only (never uploaded for races): `[ms, cell, "r"]`
 * for a letter Autocheck refused on that square, and `[ms, cell, "a" | "d"]`
 * when the solver moved to the Across / Down clue starting at that square.
 */
export type ReplayMark = [number, number, "r" | "a" | "d"];

/**
 * In a replay rebuilt from a share code (replayShare.ts), a square that held a
 * wrong letter: the code knows a letter there was wrong, not which one.
 */
export const WRONG_LETTER = "?";

/** At most this many friends race at once. */
export const MAX_GHOSTS = 3;
/** A recording holds at most this many events (the server's limit too). */
export const MAX_EVENTS = 4000;

/** Ghost colours, in pick order: away from the gold selection and the brand blue. */
export const GHOST_COLORS = ["#8b5cf6", "#06b6d4", "#ec4899"] as const;

export interface Ghost {
  userId: string;
  name: string;
  color: string;
  /** The friend's finish, whole seconds. */
  seconds: number;
  events: TraceEvent[];
  /** A shared link's sender (replayShare.ts): the share raced, and the puzzle it named, for the reply at the finish. */
  link?: { shareId: string; ref: PuzzleRef };
}

// --- Pure: recording ---

/**
 * The events between two snapshots of the solver's cells: one per square
 * whose letter changed, in cell order (a single keystroke changes one).
 */
export function diffCells(
  prev: Readonly<Record<string, CellState>>,
  next: Readonly<Record<string, CellState>>,
  width: number,
  ms: number,
): TraceEvent[] {
  const out: TraceEvent[] = [];
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    const before = prev[key]?.letter ?? "";
    const after = next[key]?.letter ?? "";
    if (before === after) continue;
    const [row, col] = key.split(",").map(Number);
    out.push([Math.max(0, Math.round(ms)), row * width + col, after]);
  }
  return out.sort((a, b) => a[1] - b[1]);
}

/** Whether a snapshot has any letter in it (a recording that starts mid-solve is partial). */
export function hasLetters(cells: Readonly<Record<string, CellState>>): boolean {
  return Object.values(cells).some((c) => !!c.letter);
}

// --- Pure: the ghost at a moment ---

export interface GhostFrame {
  /** Cell index → the letter (a full recording) or 1 (a stripped one). */
  filled: Map<number, string | number>;
  /** How many events have played. */
  played: number;
  /** The recording has reached the friend's finish. */
  finished: boolean;
}

/** Replay a recording up to `ms` of the racer's clock. */
export function ghostAt(ghost: Pick<Ghost, "events" | "seconds">, ms: number): GhostFrame {
  const filled = new Map<number, string | number>();
  let played = 0;
  for (const [at, cell, letter] of ghost.events) {
    if (at > ms) break;
    played++;
    if (letter === "" || letter === 0) filled.delete(cell);
    else filled.set(cell, letter);
  }
  return { filled, played, finished: ms >= ghost.seconds * 1000 };
}

/** The grid squares that take a letter. */
export function whiteCellCount(puzzle: Puzzle): number {
  return puzzle.cells.flat().filter((c) => c.solution !== null).length;
}

/**
 * The racer's grid tint: cell key ("row,col") → the colour of the first
 * ghost (in race order) that has the square filled now.
 */
export function ghostTints(ghosts: readonly Ghost[], frames: readonly GhostFrame[], width: number): Map<string, string> {
  const tints = new Map<string, string>();
  ghosts.forEach((ghost, i) => {
    for (const cell of frames[i]?.filled.keys() ?? []) {
      const key = `${Math.floor(cell / width)},${cell % width}`;
      if (!tints.has(key)) tints.set(key, ghost.color);
    }
  });
  return tints;
}

export interface RaceResult extends ChallengeComparison {
  name: string;
  color: string;
}

/** The racer's finish against each ghost, in race order. */
export function raceResults(ghosts: readonly Ghost[], finishSeconds: number): RaceResult[] {
  return ghosts.map((g) => ({ ...compareToChallenge(g.seconds, finishSeconds), name: g.name, color: g.color }));
}

/** A replay takes about this long whatever the solve's length, and never runs slower than REPLAY_MIN_SPEED×. */
const REPLAY_TARGET_MS = 20_000;
const REPLAY_MIN_SPEED = 4;

/** The playback speed for a solve of `seconds`: a long solve plays faster, a short one at REPLAY_MIN_SPEED×. */
export function replaySpeed(seconds: number): number {
  return Math.max(REPLAY_MIN_SPEED, Math.ceil((seconds * 1000) / REPLAY_TARGET_MS));
}

/** Normalize a recording from the server: well-formed events in time order, capped. */
export function cleanEvents(raw: unknown): TraceEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: TraceEvent[] = [];
  for (const e of raw) {
    if (!Array.isArray(e) || e.length < 3) continue;
    const [ms, cell, letter] = e;
    if (!Number.isFinite(ms) || !Number.isInteger(cell) || cell < 0) continue;
    if (typeof letter !== "string" && letter !== 0 && letter !== 1) continue;
    out.push([Number(ms), cell, letter]);
    if (out.length >= MAX_EVENTS) break;
  }
  return out.sort((a, b) => a[0] - b[0]);
}

// --- Impure: the recording in progress and the race on screen (localStorage) ---

const TRACE_KEY = "crossword-clash:solve-trace";
const RACE_KEY = "crossword-clash:race";
const INTENT_KEY = "crossword-clash:race-intent";

export interface StoredTrace {
  /** puzzleIdentity of the puzzle being recorded. */
  key: string;
  events: TraceEvent[];
  /** Refusals and clue changes, for the share replay (absent in recordings from before it). */
  marks?: ReplayMark[];
  /** The recording missed part of the solve (it began with letters already in the grid). */
  partial: boolean;
}

function read<T>(storage: Storage | undefined, name: string): T | null {
  try {
    const raw = storage?.getItem(name);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, name: string, value: unknown): void {
  try {
    if (value === null) storage?.removeItem(name);
    else storage?.setItem(name, JSON.stringify(value));
  } catch {
    // Storage full or unavailable: a recording that can't be kept is just not raceable.
  }
}

const local = () => (typeof localStorage === "undefined" ? undefined : localStorage);
const session = () => (typeof sessionStorage === "undefined" ? undefined : sessionStorage);

/** The recording in progress for this puzzle, if it is the one stored. */
export function loadTrace(key: string): StoredTrace | null {
  const stored = read<StoredTrace>(local(), TRACE_KEY);
  return stored && stored.key === key ? stored : null;
}

export function saveTrace(trace: StoredTrace | null): void {
  write(local(), TRACE_KEY, trace);
}

export interface StoredRace {
  key: string;
  ghosts: Ghost[];
}

/** The race on screen for this puzzle, so a refresh mid-race keeps the ghosts. */
export function loadRace(key: string): StoredRace | null {
  const stored = read<StoredRace>(local(), RACE_KEY);
  return stored && stored.key === key && Array.isArray(stored.ghosts) ? stored : null;
}

export function saveRace(race: StoredRace | null): void {
  write(local(), RACE_KEY, race);
}

/** A "Race" tap on the daily board: the friends to preselect once the puzzle opens. */
export interface RaceIntent {
  key: string;
  userIds: string[];
}

export function saveRaceIntent(intent: RaceIntent | null): void {
  write(session(), INTENT_KEY, intent);
}

export function takeRaceIntent(key: string): string[] {
  const intent = read<RaceIntent>(session(), INTENT_KEY);
  if (!intent || intent.key !== key) return [];
  write(session(), INTENT_KEY, null);
  return Array.isArray(intent.userIds) ? intent.userIds.slice(0, MAX_GHOSTS) : [];
}

// --- Impure: the server ---

export interface RaceCandidate {
  userId: string;
  username: string;
  /** Their time, for Plus only (null otherwise). */
  seconds: number | null;
  /** An accepted friend (listed first); otherwise a public solver. */
  friend: boolean;
}

export type RaceVisibility = "everyone" | "friends" | "hidden";

export class RaceError extends Error {
  readonly kind: "plus" | "unavailable" | "failed";
  constructor(kind: RaceError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

function db() {
  if (!supabase) throw new RaceError("failed", "Supabase isn't configured in this build.");
  return supabase;
}

const refusal = (error: { message?: string }): RaceError =>
  new RaceError(/plus_required/.test(error.message ?? "") ? "plus" : /not_available/.test(error.message ?? "") ? "unavailable" : "failed", error.message ?? "failed");

/** Raceable recordings of this puzzle: friends first, then the fastest public ones. */
export async function fetchRaceCandidates(puzzleKey: string): Promise<RaceCandidate[]> {
  const { data, error } = await db().rpc("race_candidates", { p_puzzle_key: puzzleKey });
  if (error) throw refusal(error);
  return ((data ?? []) as { user_id: string; username: string; seconds: number | null; friend: boolean }[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    seconds: r.seconds,
    friend: !!r.friend,
  }));
}

/** A recording to race or replay (Plus): stripped of letters until the caller has finished the puzzle. */
export async function fetchSolveTrace(userId: string, puzzleKey: string): Promise<{ seconds: number; events: TraceEvent[]; withLetters: boolean } | null> {
  const { data, error } = await db().rpc("solve_trace", { p_user: userId, p_puzzle_key: puzzleKey });
  if (error) throw refusal(error);
  const row = ((data ?? []) as { seconds: number; events: unknown; with_letters: boolean }[])[0];
  return row ? { seconds: row.seconds, events: cleanEvents(row.events), withLetters: row.with_letters } : null;
}

/** File a finished solve's recording; the server keeps the fastest. Best-effort. */
export async function saveSolveTrace(puzzleKey: string, seconds: number, events: TraceEvent[]): Promise<void> {
  if (!supabase || events.length === 0 || events.length > MAX_EVENTS) return;
  await supabase.rpc("save_solve_trace", { p_puzzle_key: puzzleKey, p_seconds: Math.max(0, Math.floor(seconds)), p_events: events });
}

/** The account's "Who can race and replay my solves" setting. */
export async function setRaceVisibility(userId: string, visibility: RaceVisibility): Promise<void> {
  const { error } = await db().from("profiles").update({ race_visibility: visibility }).eq("user_id", userId);
  if (error) throw refusal(error);
}

export async function fetchRaceVisibility(userId: string): Promise<RaceVisibility> {
  const { data, error } = await db().from("profiles").select("race_visibility").eq("user_id", userId).maybeSingle();
  if (error) throw refusal(error);
  return (data as { race_visibility?: RaceVisibility } | null)?.race_visibility ?? "everyone";
}
