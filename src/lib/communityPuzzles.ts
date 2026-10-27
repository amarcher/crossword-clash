/**
 * Community puzzles (docs/community-puzzles-spec.md): what a studio author
 * publishes, how the browse screen asks for it, and the four writes.
 *
 * Pure parts (tested): the publish checks (`publishProblems`), the snapshot
 * (`toPublishSnapshot`, the same TransferPuzzle the feed and the daily queue
 * use), the size buckets, the browse filters ↔ URL params, and the query
 * each filter turns into (`applyBrowseFilters` over a PostgREST-shaped
 * builder). The client functions below wrap the `community_puzzles` view and
 * the RPCs from migration 20261028000000 and map a refusal's `community:<code>`
 * message to a `CommunityError`.
 */
import { supabase } from "./supabaseClient";
import { normalizeTransferPuzzle, type TransferPuzzle } from "./puzzleNormalizer";
import { puzzleIdentity } from "./soloStats";
import { puzzleContentHash } from "./puzzleHash";
import { isObjectionableName } from "./nameFilter";
import { gridStats, slotsOf, slotText } from "./seedgrid/grid";
import { toTransferPuzzle, type ClueSet } from "./seedgrid/ipuz";
import { slotKey, type StudioState } from "./seedgrid/studioState";
import { clueOk, type Difficulty } from "./seedgrid/cluePrompt";
import { CLUE_MAX, clueGivesAway } from "./seedgrid/audit";
import type { Puzzle } from "../types/puzzle";
import type { Database } from "../types/supabase";

// --- Shapes -----------------------------------------------------------------

export type CommunityRow = Database["public"]["Views"]["community_puzzles"]["Row"];
/** A list card: everything but the snapshot. */
export type CommunityPuzzle = Omit<CommunityRow, "puzzle" | "search">;
/** The page: with the snapshot. */
export type CommunityPuzzleFull = Omit<CommunityRow, "search">;
export type PublisherRow = Database["public"]["Tables"]["publishers"]["Row"];
export type CommunityStatus = CommunityRow["status"];
export type CommunityLang = CommunityRow["lang"];
export type ReportReason = Database["public"]["Tables"]["puzzle_reports"]["Row"]["reason"];
export type RemovedReason = NonNullable<CommunityRow["removed_reason"]>;

export const REPORT_REASONS: readonly ReportReason[] = ["copied", "offensive", "nonsense", "other"];
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
export const COMMUNITY_LANGS: readonly CommunityLang[] = ["en", "es"];

export const MAX_TITLE = 80;
export const MAX_NOTES = 280;
export const MAX_REPORT_DETAILS = 500;
export const MAX_SIDE = 25;
export const MIN_SIDE = 3;
export const PAGE_SIZE = 24;

/** The list's columns: everything the card shows, never the snapshot. */
export const LIST_COLUMNS =
  "id, short_id, author_id, author, studio_id, version, status, title, notes, difficulty, lang, width, height, clue_count, puzzle_key, plays, solves, published_at, updated_at, removed_reason";
export const FULL_COLUMNS = `${LIST_COLUMNS}, puzzle`;

// --- Sizes ------------------------------------------------------------------

/** The daily vocabulary: mini ≤ 7, midi 8–10, full 11–15, giant 16+ (by the longer side). */
export type SizeBucket = "mini" | "midi" | "full" | "giant";
export const SIZE_BUCKETS: readonly SizeBucket[] = ["mini", "midi", "full", "giant"];
const SIZE_MAX: Record<SizeBucket, number> = { mini: 7, midi: 10, full: 15, giant: Infinity };

export function sizeBucketOf(width: number, height: number): SizeBucket {
  const side = Math.max(width, height);
  if (side <= SIZE_MAX.mini) return "mini";
  if (side <= SIZE_MAX.midi) return "midi";
  if (side <= SIZE_MAX.full) return "full";
  return "giant";
}

// --- Browse filters ---------------------------------------------------------

export type CommunitySort = "newest" | "popular" | "solved";
export const SORTS: readonly CommunitySort[] = ["newest", "popular", "solved"];

export interface BrowseFilters {
  size: SizeBucket | "all";
  difficulty: Difficulty | "all";
  lang: CommunityLang | "all";
  sort: CommunitySort;
  /** Title and note search; an "@name" query becomes the author filter. */
  query: string;
  /** Username (case-insensitive); the author page fixes it. */
  author: string | null;
}

export function defaultFilters(lang: CommunityLang): BrowseFilters {
  return { size: "all", difficulty: "all", lang, sort: "newest", query: "", author: null };
}

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | null => (allowed.includes(value as T) ? (value as T) : null);

/** Filters from the URL (`?size=full&sort=popular&q=birds&lang=all&by=archer`); anything unknown falls back. */
export function parseBrowseParams(params: URLSearchParams, defaultLang: CommunityLang): BrowseFilters {
  const base = defaultFilters(defaultLang);
  const lang = params.get("lang");
  return {
    size: oneOf(params.get("size"), SIZE_BUCKETS) ?? base.size,
    difficulty: oneOf(params.get("difficulty"), DIFFICULTIES) ?? base.difficulty,
    lang: lang === "all" ? "all" : (oneOf(lang, COMMUNITY_LANGS) ?? base.lang),
    sort: oneOf(params.get("sort"), SORTS) ?? base.sort,
    query: (params.get("q") ?? "").slice(0, 80),
    author: params.get("by")?.trim() || null,
  };
}

/** The URL for a set of filters: only what differs from the defaults, so the plain route stays clean. */
export function browseParams(filters: BrowseFilters, defaultLang: CommunityLang): URLSearchParams {
  const base = defaultFilters(defaultLang);
  const params = new URLSearchParams();
  if (filters.size !== base.size) params.set("size", filters.size);
  if (filters.difficulty !== base.difficulty) params.set("difficulty", filters.difficulty);
  if (filters.lang !== base.lang) params.set("lang", filters.lang);
  if (filters.sort !== base.sort) params.set("sort", filters.sort);
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.author) params.set("by", filters.author);
  return params;
}

/** A typed "@name" search means the author; returns the filters with that moved over. */
export function normalizeQuery(filters: BrowseFilters): BrowseFilters {
  const q = filters.query.trim();
  const at = /^@([A-Za-z0-9_]{3,20})$/.exec(q);
  if (!at) return filters;
  return { ...filters, query: "", author: at[1] };
}

/** The subset of a PostgREST filter builder the browse query uses (so tests can fake it). */
export interface BrowseBuilder {
  eq(column: string, value: string | number): this;
  lte(column: string, value: number): this;
  or(filters: string): this;
  ilike(column: string, pattern: string): this;
  textSearch(column: string, query: string, options: { type: "websearch"; config: string }): this;
  order(column: string, options: { ascending: boolean }): this;
  range(from: number, to: number): this;
}

/** Applies the filters, sort and page to a `community_puzzles` query (published rows only). */
export function applyBrowseFilters<B extends BrowseBuilder>(builder: B, filters: BrowseFilters, page: number, pageSize = PAGE_SIZE): B {
  let q = builder.eq("status", "published");
  if (filters.size !== "all") {
    const max = SIZE_MAX[filters.size];
    const min = filters.size === "mini" ? 0 : SIZE_MAX[SIZE_BUCKETS[SIZE_BUCKETS.indexOf(filters.size) - 1]] + 1;
    if (Number.isFinite(max)) q = q.lte("width", max).lte("height", max);
    if (min > 0) q = q.or(`width.gte.${min},height.gte.${min}`);
  }
  if (filters.difficulty !== "all") q = q.eq("difficulty", filters.difficulty);
  if (filters.lang !== "all") q = q.eq("lang", filters.lang);
  if (filters.author) q = q.ilike("author", filters.author.replace(/[%_]/g, ""));
  const text = filters.query.trim();
  if (text) q = q.textSearch("search", text, { type: "websearch", config: "simple" });
  if (filters.sort === "popular") q = q.order("plays", { ascending: false });
  if (filters.sort === "solved") q = q.order("solves", { ascending: false });
  q = q.order("published_at", { ascending: false });
  return q.range(page * pageSize, page * pageSize + pageSize - 1);
}

/** Drops the cards of hidden authors; the count says how many the device hid. */
export function withoutHidden<T extends { author_id: string }>(rows: readonly T[], hidden: readonly string[]): { rows: T[]; hiddenCount: number } {
  if (hidden.length === 0) return { rows: [...rows], hiddenCount: 0 };
  const set = new Set(hidden);
  const kept = rows.filter((r) => !set.has(r.author_id));
  return { rows: kept, hiddenCount: rows.length - kept.length };
}

// --- The snapshot and its checks ---------------------------------------------

/** The studio's clues by slot id, the shape `toTransferPuzzle` wants (speed clues are not published). */
export function studioClues(state: Pick<StudioState, "grid" | "clues">): Record<string, ClueSet> {
  const clues: Record<string, ClueSet> = {};
  for (const s of slotsOf(state.grid)) {
    const standard = state.clues[slotKey(s)]?.trim();
    if (standard) clues[s.id] = { standard };
  }
  return clues;
}

/** The published snapshot: the transfer puzzle credited to the author's username. */
export function toPublishSnapshot(state: Pick<StudioState, "grid" | "clues" | "title">, author: string): TransferPuzzle {
  return toTransferPuzzle(state.grid, studioClues(state), { title: state.title.trim(), author });
}

/**
 * Why this studio puzzle cannot be published yet (empty when it can), in the
 * order the dialog lists them. `ours` is the set of `puzzleIdentity()` keys of
 * the dailies and classics (a Crossword Clash puzzle is never republished).
 * The word filter is the display-name filter applied to each text.
 */
export function publishProblems(state: Pick<StudioState, "grid" | "clues" | "title">, opts: { ours?: ReadonlySet<string>; notes?: string } = {}): string[] {
  const problems: string[] = [];
  const { grid } = state;
  const side = Math.max(grid.width, grid.height);
  const minSide = Math.min(grid.width, grid.height);
  if (side > MAX_SIDE || minSide < MIN_SIDE) problems.push(`Grids are between ${MIN_SIDE}×${MIN_SIDE} and ${MAX_SIDE}×${MAX_SIDE}.`);
  if (grid.cells.some((c) => c === "")) problems.push("Fill every square.");
  else if (!gridStats(grid).connected) problems.push("The grid is split into islands; connect it.");

  const title = state.title.trim();
  if (!title) problems.push("Give it a title.");
  else if (title.length > MAX_TITLE) problems.push(`Keep the title under ${MAX_TITLE} characters.`);
  const notes = opts.notes ?? "";
  if (notes.length > MAX_NOTES) problems.push(`Keep the note under ${MAX_NOTES} characters.`);

  const slots = slotsOf(grid);
  const unclued = slots.filter((s) => !state.clues[slotKey(s)]?.trim());
  if (unclued.length) problems.push(`Clue ${unclued.slice(0, 6).map((s) => s.id).join(", ")}${unclued.length > 6 ? ` and ${unclued.length - 6} more` : ""}.`);
  const weak = slots.filter((s) => {
    const clue = state.clues[slotKey(s)]?.trim();
    if (!clue) return false;
    const answer = slotText(grid, s);
    return clue.length > CLUE_MAX || clueGivesAway(clue, answer) || !clueOk(answer, clue);
  });
  if (weak.length) problems.push(`Fix the clue for ${weak.slice(0, 6).map((s) => s.id).join(", ")}${weak.length > 6 ? ` and ${weak.length - 6} more` : ""} (too long, or it gives the answer away).`);

  const wording: string[] = [];
  if (title && isObjectionableName(title)) wording.push("the title");
  if (notes && isObjectionableName(notes)) wording.push("the note");
  const rudeClues = slots.filter((s) => {
    const clue = state.clues[slotKey(s)]?.trim();
    return !!clue && isObjectionableName(clue);
  });
  if (rudeClues.length) wording.push(`the clue for ${rudeClues.map((s) => s.id).join(", ")}`);
  if (wording.length) problems.push(`Change the wording of ${wording.join(" and ")}.`);

  if (opts.ours && opts.ours.size > 0 && !grid.cells.some((c) => c === "") && title) {
    const key = puzzleIdentity(normalizeTransferPuzzle(toPublishSnapshot(state, "")));
    if (opts.ours.has(key)) problems.push("This is a Crossword Clash puzzle (a daily or a classic); publish your own.");
  }
  return problems;
}

/** The keys the server stores beside the snapshot: `puzzleIdentity()` for the rest of the app, the content hash for duplicates. */
export async function snapshotKeys(snapshot: TransferPuzzle): Promise<{ puzzleKey: string; contentHash: string }> {
  const puzzle = normalizeTransferPuzzle(snapshot);
  return { puzzleKey: puzzleIdentity(puzzle), contentHash: await puzzleContentHash(puzzle) };
}

/** A row as the solver plays it: the live username as author, tagged so finishes record under `community`. */
export function toPlayablePuzzle(row: Pick<CommunityPuzzleFull, "puzzle" | "author">): Puzzle {
  const transfer = row.puzzle as TransferPuzzle;
  return normalizeTransferPuzzle({ ...transfer, author: row.author, origin: "community" });
}

/** The page link for a row. */
export const puzzlePath = (shortId: string) => `/puzzles/${shortId}`;
export const authorPath = (username: string) => `/puzzles/by/${encodeURIComponent(username)}`;

// --- Errors -----------------------------------------------------------------

export type CommunityErrorKind =
  | "not_signed_in"
  | "no_username"
  | "terms"
  | "banned"
  | "invalid"
  | "rate_limited"
  | "too_many"
  | "already_published"
  | "under_review"
  | "removed"
  | "not_found"
  | "own_puzzle"
  | "already_reported"
  | "unconfigured"
  | "failed";

const KINDS: readonly CommunityErrorKind[] = [
  "not_signed_in", "no_username", "terms", "banned", "invalid", "rate_limited", "too_many",
  "already_published", "under_review", "removed", "not_found", "own_puzzle", "already_reported",
];

export class CommunityError extends Error {
  readonly kind: CommunityErrorKind;
  constructor(kind: CommunityErrorKind, message: string = kind) {
    super(message);
    this.name = "CommunityError";
    this.kind = kind;
  }
}

/** The kind a refusal's message names (`community:<code>`), else "failed". */
export function communityErrorKind(message: string | null | undefined): CommunityErrorKind {
  const code = /community:([a-z_]+)/.exec(message ?? "")?.[1];
  return KINDS.find((k) => k === code) ?? "failed";
}

function client() {
  if (!supabase) throw new CommunityError("unconfigured", "Supabase isn't configured in this build.");
  return supabase;
}

const refusal = (error: { message?: string } | null): CommunityError => new CommunityError(communityErrorKind(error?.message), error?.message ?? "failed");

// --- Reads ------------------------------------------------------------------

export async function fetchCommunityList(filters: BrowseFilters, page = 0): Promise<CommunityPuzzle[]> {
  const base = client().from("community_puzzles").select(LIST_COLUMNS);
  const query = applyBrowseFilters(base as unknown as BrowseBuilder, normalizeQuery(filters), page) as unknown as PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  const { data, error } = await query;
  if (error) throw refusal(error);
  return ((data as CommunityPuzzle[] | null) ?? []) as CommunityPuzzle[];
}

/** One puzzle by its short id: null when there is none (or it is not the viewer's to see). */
export async function fetchCommunityPuzzle(shortId: string): Promise<CommunityPuzzleFull | null> {
  const { data, error } = await client().from("community_puzzles").select(FULL_COLUMNS).eq("short_id", shortId).maybeSingle();
  if (error) throw refusal(error);
  return (data as unknown as CommunityPuzzleFull | null) ?? null;
}

/** The account's own puzzles in every status, newest first. */
export async function fetchMyPuzzles(userId: string): Promise<CommunityPuzzle[]> {
  const { data, error } = await client().from("community_puzzles").select(LIST_COLUMNS).eq("author_id", userId).order("updated_at", { ascending: false });
  if (error) throw refusal(error);
  return (data ?? []) as unknown as CommunityPuzzle[];
}

/** The caller's publisher row (terms, strikes, a ban), or null before the first acceptance. */
export async function fetchPublisher(userId: string): Promise<PublisherRow | null> {
  const { data, error } = await client().from("publishers").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw refusal(error);
  return data ?? null;
}

// --- Writes -----------------------------------------------------------------

export async function acceptPublishingTerms(version: string): Promise<void> {
  const { error } = await client().rpc("accept_publishing_terms", { p_version: version });
  if (error) throw refusal(error);
}

export interface PublishInput {
  studioId: string;
  title: string;
  notes: string;
  difficulty: Difficulty;
  lang: CommunityLang;
  snapshot: TransferPuzzle;
}

export interface Published {
  id: string;
  shortId: string;
  version: number;
}

export async function publishPuzzle(input: PublishInput): Promise<Published> {
  const { puzzleKey, contentHash } = await snapshotKeys(input.snapshot);
  const { data, error } = await client().rpc("publish_puzzle", {
    p_studio_id: input.studioId,
    p_title: input.title.trim(),
    p_notes: input.notes.trim(),
    p_difficulty: input.difficulty,
    p_lang: input.lang,
    p_puzzle: input.snapshot,
    p_puzzle_key: puzzleKey,
    p_content_hash: contentHash,
  });
  if (error) throw refusal(error);
  const row = (Array.isArray(data) ? data[0] : data) as { id: string; short_id: string; version: number } | undefined;
  if (!row) throw new CommunityError("failed");
  return { id: row.id, shortId: row.short_id, version: row.version };
}

export async function unpublishPuzzle(id: string): Promise<void> {
  const { error } = await client().rpc("unpublish_puzzle", { p_id: id });
  if (error) throw refusal(error);
}

/** Reports a puzzle; resolves to whether it is now held pending review. */
export async function reportPuzzle(id: string, reason: ReportReason, details: string): Promise<{ held: boolean }> {
  const { data, error } = await client().rpc("report_puzzle", { p_puzzle_id: id, p_reason: reason, p_details: details.trim().slice(0, MAX_REPORT_DETAILS) });
  if (error) throw refusal(error);
  return { held: data === true };
}
