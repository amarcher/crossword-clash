import { beforeEach, describe, expect, it, vi } from "vitest";
import { gridFromRows } from "./seedgrid/grid";
import { initialStudioState, slotKey, type StudioState } from "./seedgrid/studioState";
import { slotsOf } from "./seedgrid/grid";
import { puzzleIdentity } from "./soloStats";
import { normalizeTransferPuzzle } from "./puzzleNormalizer";

// A chainable PostgREST fake: every call records itself; awaiting the chain
// (or a terminal maybeSingle) resolves with the next scripted result.
const calls: { table: string; op: string; args: unknown[] }[] = [];
let results: { data: unknown; error: unknown }[] = [];
const rpcCalls: { fn: string; args: unknown }[] = [];
function chain(table: string) {
  const api: Record<string, unknown> = {};
  for (const op of ["select", "eq", "lte", "or", "ilike", "textSearch", "order", "range", "maybeSingle"]) {
    api[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      if (op === "maybeSingle") return Promise.resolve(results.shift() ?? { data: null, error: null });
      return api;
    };
  }
  api.then = (resolve: (v: unknown) => unknown) => Promise.resolve(results.shift() ?? { data: [], error: null }).then(resolve);
  return api;
}
vi.mock("./supabaseClient", () => ({
  supabase: {
    from: (table: string) => chain(table),
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(results.shift() ?? { data: null, error: null });
    },
  },
}));

const {
  applyBrowseFilters,
  browseParams,
  communityErrorKind,
  CommunityError,
  defaultFilters,
  fetchCommunityList,
  fetchCommunityPuzzle,
  normalizeQuery,
  parseBrowseParams,
  publishProblems,
  publishPuzzle,
  reportPuzzle,
  sizeBucketOf,
  snapshotKeys,
  studioClues,
  toPlayablePuzzle,
  toPublishSnapshot,
  unpublishPuzzle,
  withoutHidden,
} = await import("./communityPuzzles");
type BrowseFilters = import("./communityPuzzles").BrowseFilters;

/** A clued 3×3 studio puzzle. */
function studio(overrides: Partial<StudioState> = {}): StudioState {
  const grid = gridFromRows(["CAT", "ORE", "WED"]);
  const clues: Record<string, string> = {};
  const text: Record<string, string> = { "1A": "Tabby", "4A": "Mined rock", "5A": "Tied the knot", "1D": "Dairy animal", "2D": "Exist", "3D": "Talk series" };
  for (const s of slotsOf(grid)) clues[slotKey(s)] = text[s.id];
  return { ...initialStudioState(3), grid, clues, title: "Farm", ...overrides };
}

beforeEach(() => {
  calls.length = 0;
  rpcCalls.length = 0;
  results = [];
});

describe("sizeBucketOf", () => {
  it("uses the daily vocabulary by the longer side", () => {
    expect(sizeBucketOf(5, 5)).toBe("mini");
    expect(sizeBucketOf(7, 7)).toBe("mini");
    expect(sizeBucketOf(9, 9)).toBe("midi");
    expect(sizeBucketOf(8, 5)).toBe("midi");
    expect(sizeBucketOf(15, 15)).toBe("full");
    expect(sizeBucketOf(11, 9)).toBe("full");
    expect(sizeBucketOf(21, 21)).toBe("giant");
  });
});

describe("browse filters", () => {
  it("round-trips through URL params, writing only what differs from the defaults", () => {
    expect(browseParams(defaultFilters("en"), "en").toString()).toBe("");
    const filters: BrowseFilters = { size: "full", difficulty: "hard", lang: "all", sort: "popular", query: "birds", author: "archer" };
    const params = browseParams(filters, "en");
    expect(params.toString()).toBe("size=full&difficulty=hard&lang=all&sort=popular&q=birds&by=archer");
    expect(parseBrowseParams(params, "en")).toEqual(filters);
  });

  it("falls back for unknown values and defaults the language to the viewer's", () => {
    const parsed = parseBrowseParams(new URLSearchParams("size=huge&sort=best&difficulty=brutal&lang=fr"), "es");
    expect(parsed).toEqual(defaultFilters("es"));
    expect(parseBrowseParams(new URLSearchParams("lang=en"), "es").lang).toBe("en");
    expect(parseBrowseParams(new URLSearchParams(`q=${"x".repeat(100)}`), "en").query).toHaveLength(80);
  });

  it("turns an @name query into the author filter", () => {
    expect(normalizeQuery({ ...defaultFilters("en"), query: "@archer" })).toEqual({ ...defaultFilters("en"), query: "", author: "archer" });
    expect(normalizeQuery({ ...defaultFilters("en"), query: "archer" }).author).toBeNull();
    expect(normalizeQuery({ ...defaultFilters("en"), query: "@no" }).author).toBeNull();
  });

  it("applies each filter, the sort and the page to the query", () => {
    const seen: string[] = [];
    const builder = {
      eq: (c: string, v: unknown) => (seen.push(`eq ${c}=${v}`), builder),
      lte: (c: string, v: number) => (seen.push(`lte ${c}<=${v}`), builder),
      or: (f: string) => (seen.push(`or ${f}`), builder),
      ilike: (c: string, p: string) => (seen.push(`ilike ${c}~${p}`), builder),
      textSearch: (c: string, q: string, o: { type: string; config: string }) => (seen.push(`search ${c}:${q}:${o.type}:${o.config}`), builder),
      order: (c: string, o: { ascending: boolean }) => (seen.push(`order ${c} ${o.ascending ? "asc" : "desc"}`), builder),
      range: (a: number, b: number) => (seen.push(`range ${a}-${b}`), builder),
    };
    applyBrowseFilters(builder, { size: "midi", difficulty: "easy", lang: "es", sort: "popular", query: "pájaros", author: "Ar_cher%" }, 2);
    expect(seen).toEqual([
      "eq status=published",
      "lte width<=10",
      "lte height<=10",
      "or width.gte.8,height.gte.8",
      "eq difficulty=easy",
      "eq lang=es",
      "ilike author~Ar_cher".replace("Ar_cher", "Archer"),
      "search search:pájaros:websearch:simple",
      "order plays desc",
      "order published_at desc",
      "range 48-71",
    ]);

    seen.length = 0;
    applyBrowseFilters(builder, { ...defaultFilters("en"), size: "giant", lang: "all", sort: "solved" }, 0);
    expect(seen).toEqual(["eq status=published", "or width.gte.16,height.gte.16", "order solves desc", "order published_at desc", "range 0-23"]);

    seen.length = 0;
    applyBrowseFilters(builder, { ...defaultFilters("en"), size: "mini" }, 0);
    expect(seen).toEqual(["eq status=published", "lte width<=7", "lte height<=7", "eq lang=en", "order published_at desc", "range 0-23"]);
  });

  it("drops hidden authors' rows and counts them", () => {
    const rows = [{ author_id: "a" }, { author_id: "b" }, { author_id: "a" }];
    expect(withoutHidden(rows, ["a"])).toEqual({ rows: [{ author_id: "b" }], hiddenCount: 2 });
    expect(withoutHidden(rows, [])).toEqual({ rows, hiddenCount: 0 });
  });
});

describe("snapshot", () => {
  it("publishes the studio's clues under the author's username, with the speed tier left out", () => {
    const state = studio({ speedClues: { [slotKey(slotsOf(gridFromRows(["CAT", "ORE", "WED"]))[0])]: "Pet" } });
    expect(studioClues(state)["1A"]).toEqual({ standard: "Tabby" });
    const snapshot = toPublishSnapshot(state, "archer");
    expect(snapshot.title).toBe("Farm");
    expect(snapshot.author).toBe("archer");
    expect(snapshot.grid).toEqual(["C", "A", "T", "O", "R", "E", "W", "E", "D"]);
    expect(snapshot.clues.across[0]).toBe("1. Tabby");
  });

  it("keys the snapshot by puzzleIdentity and a 64-hex content hash", async () => {
    const snapshot = toPublishSnapshot(studio(), "archer");
    const keys = await snapshotKeys(snapshot);
    expect(keys.puzzleKey).toBe(puzzleIdentity(normalizeTransferPuzzle(snapshot)));
    expect(keys.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("plays a row with the live username as author, tagged as a community puzzle", () => {
    const row = { puzzle: toPublishSnapshot(studio(), "old_name"), author: "new_name" };
    const puzzle = toPlayablePuzzle(row);
    expect(puzzle.author).toBe("new_name");
    expect(puzzle.origin).toBe("community");
    expect(puzzle.title).toBe("Farm");
  });
});

describe("publishProblems", () => {
  it("is empty for a complete, titled, clued, connected grid", () => {
    expect(publishProblems(studio())).toEqual([]);
  });

  it("names every gap: empty squares, no title, missing clues", () => {
    const state = studio({ title: " ", clues: {} });
    state.grid.cells[4] = "";
    const problems = publishProblems(state);
    expect(problems).toContain("Fill every square.");
    expect(problems).toContain("Give it a title.");
    expect(problems).toContain("Clue 1A, 1D, 2D, 3D, 4A, 5A.");
  });

  it("refuses a split grid, an oversize grid and an overlong title or note", () => {
    const split = studio({ grid: gridFromRows(["AB#", "###", "#CD"]) });
    expect(publishProblems(split).some((p) => p.includes("split"))).toBe(true);
    const tiny = studio({ grid: gridFromRows(["AB", "CD"]) });
    expect(publishProblems(tiny)[0]).toMatch(/between 3×3 and 25×25/);
    expect(publishProblems(studio({ title: "x".repeat(81) }))).toContain("Keep the title under 80 characters.");
    expect(publishProblems(studio(), { notes: "y".repeat(281) })).toContain("Keep the note under 280 characters.");
  });

  it("flags a clue that is too long or gives its answer away", () => {
    const state = studio();
    const key1A = slotKey(slotsOf(state.grid)[0]);
    state.clues[key1A] = "A cat, plainly";
    expect(publishProblems(state).some((p) => p.startsWith("Fix the clue for 1A"))).toBe(true);
    state.clues[key1A] = "A very long clue that goes on and on and on past the limit";
    expect(publishProblems(state).some((p) => p.startsWith("Fix the clue for 1A"))).toBe(true);
  });

  it("refuses objectionable wording in the title, the note or a clue, naming where", () => {
    expect(publishProblems(studio({ title: "Total shit" }))).toContain("Change the wording of the title.");
    expect(publishProblems(studio(), { notes: "you asshole" })).toContain("Change the wording of the note.");
    const state = studio();
    state.clues[slotKey(slotsOf(state.grid).find((s) => s.id === "4A")!)] = "Bitch, mined";
    expect(publishProblems(state)).toContain("Change the wording of the clue for 4A.");
  });

  it("refuses one of ours by identity", () => {
    const state = studio();
    const ours = new Set([puzzleIdentity(normalizeTransferPuzzle(toPublishSnapshot(state, "")))]);
    expect(publishProblems(state, { ours })).toEqual(["This is a Crossword Clash puzzle (a daily or a classic); publish your own."]);
    expect(publishProblems(state, { ours: new Set(["other"]) })).toEqual([]);
  });
});

describe("errors", () => {
  it("maps a refusal's code and falls back to failed", () => {
    expect(communityErrorKind('P0001: community:already_published')).toBe("already_published");
    expect(communityErrorKind("community:terms")).toBe("terms");
    expect(communityErrorKind("community:nonsense_code")).toBe("failed");
    expect(communityErrorKind(null)).toBe("failed");
    expect(new CommunityError("banned").kind).toBe("banned");
  });
});

describe("client", () => {
  it("lists published rows through the view with the filters applied, and never asks for the snapshot", async () => {
    results = [{ data: [{ id: "1", author_id: "a" }], error: null }];
    const rows = await fetchCommunityList({ ...defaultFilters("en"), query: "@archer" }, 1);
    expect(rows).toEqual([{ id: "1", author_id: "a" }]);
    expect(calls[0]).toEqual({ table: "community_puzzles", op: "select", args: [expect.not.stringContaining("puzzle,")] });
    expect(calls.some((c) => c.op === "ilike" && c.args[0] === "author" && c.args[1] === "archer")).toBe(true);
    expect(calls.find((c) => c.op === "range")?.args).toEqual([24, 47]);
  });

  it("fetches a page by short id with the snapshot, null when there is none, and throws on an error", async () => {
    results = [{ data: { id: "1", puzzle: {} }, error: null }, { data: null, error: null }, { data: null, error: { message: "boom" } }];
    expect(await fetchCommunityPuzzle("k7m3x2q9")).toEqual({ id: "1", puzzle: {} });
    expect(calls.find((c) => c.op === "select")?.args[0]).toContain("puzzle");
    expect(calls.find((c) => c.op === "eq")?.args).toEqual(["short_id", "k7m3x2q9"]);
    expect(await fetchCommunityPuzzle("nope")).toBeNull();
    await expect(fetchCommunityPuzzle("x")).rejects.toMatchObject({ kind: "failed" });
  });

  it("publishes through the RPC with the computed keys and reads the row back", async () => {
    results = [{ data: [{ id: "row", short_id: "abcdefgh", version: 2 }], error: null }];
    const snapshot = toPublishSnapshot(studio(), "archer");
    const out = await publishPuzzle({ studioId: "p-1", title: " Farm ", notes: "", difficulty: "medium", lang: "en", snapshot });
    expect(out).toEqual({ id: "row", shortId: "abcdefgh", version: 2 });
    const keys = await snapshotKeys(snapshot);
    expect(rpcCalls[0]).toEqual({
      fn: "publish_puzzle",
      args: { p_studio_id: "p-1", p_title: "Farm", p_notes: "", p_difficulty: "medium", p_lang: "en", p_puzzle: snapshot, p_puzzle_key: keys.puzzleKey, p_content_hash: keys.contentHash },
    });
  });

  it("surfaces a refusal by kind", async () => {
    results = [{ data: null, error: { message: "community:rate_limited" } }];
    await expect(publishPuzzle({ studioId: "p", title: "T", notes: "", difficulty: "easy", lang: "en", snapshot: toPublishSnapshot(studio(), "a") })).rejects.toMatchObject({ kind: "rate_limited" });
    results = [{ data: null, error: { message: "community:not_found" } }];
    await expect(unpublishPuzzle("row")).rejects.toMatchObject({ kind: "not_found" });
    expect(rpcCalls[1]).toEqual({ fn: "unpublish_puzzle", args: { p_id: "row" } });
  });

  it("reports with the reason and trimmed details, and says whether the puzzle is now held", async () => {
    results = [{ data: true, error: null }];
    expect(await reportPuzzle("row", "copied", `  stolen ${"x".repeat(600)}`)).toEqual({ held: true });
    const args = rpcCalls[0].args as { p_details: string; p_reason: string };
    expect(args.p_reason).toBe("copied");
    expect(args.p_details).toHaveLength(500);
    expect(args.p_details.startsWith("stolen")).toBe(true);
  });
});
