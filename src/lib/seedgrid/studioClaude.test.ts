import { describe, it, expect } from "vitest";
import { gridFromRows } from "./grid";
import { draftClues, entryAnswers, puzzleContext, suggestClues, suggestTitles, type ClaudeCaller } from "./studioClaude";
import { ALTERNATIVES_COUNT, alternativesRequest, cluesRequest, NO_THEME, TITLE_MAX, TITLES_COUNT, titlesRequest, vetAlternatives, vetTitles, type ClaudeJsonRequest } from "./cluePrompt";

const grid = gridFromRows(["BAT", "ORE", "WED"]);

/** A fake Claude that answers each request with the next canned reply and records the prompts. */
function fake(...replies: unknown[]): ClaudeCaller & { prompts: string[] } {
  const prompts: string[] = [];
  const call = (async (req: ClaudeJsonRequest) => {
    prompts.push(req.prompt);
    return replies.shift();
  }) as ClaudeCaller & { prompts: string[] };
  call.prompts = prompts;
  return call;
}

describe("clue prompts", () => {
  it("lists only the requested slots and carries the difficulty", () => {
    const req = cluesRequest(grid, "Theme: bats", { slots: ["1A", "2D"], difficulty: "hard" });
    expect(req.prompt).toContain("1A BAT");
    expect(req.prompt).toContain("2D ARE");
    expect(req.prompt).not.toContain("5A WED");
    expect(req.prompt).toMatch(/Saturday/);
    expect(req.prompt).toContain("Theme: bats");
  });

  it("asks for alternatives that differ from the current clue", () => {
    const req = alternativesRequest(grid, "", "1A", { current: "Cave flier", count: 5 });
    expect(req.prompt).toContain("5 different clues for 1A BAT");
    expect(req.prompt).toContain('"Cave flier"');
  });

  it("asks for a small fixed number of alternatives by default, in one call", () => {
    expect(ALTERNATIVES_COUNT).toBe(3);
    const req = alternativesRequest(grid, "", "1A");
    expect(req.prompt).toContain(`${ALTERNATIVES_COUNT} different clues for 1A BAT`);
    expect(req.schema).toMatchObject({ properties: { clues: { type: "array", items: { type: "string" } } }, required: ["clues"] });
  });

  it("tells the writer there is no theme unless the note states one", () => {
    expect(cluesRequest(grid, "").prompt).toContain(NO_THEME);
    expect(cluesRequest(grid, "Title: Bats\nTheme entries: BAT").prompt).toContain(NO_THEME);
    expect(alternativesRequest(grid, "", "1A").prompt).toContain(NO_THEME);
    const themed = cluesRequest(grid, "Theme: cave dwellers");
    expect(themed.prompt).not.toContain(NO_THEME);
    expect(themed.prompt).toContain("when one is stated above");
  });
});

describe("titles", () => {
  it("asks for a few titles from the entries, their clues and the current title", () => {
    const req = titlesRequest(grid, "Theme: cave dwellers", { "1A": "Cave flier", "4A": "" }, { current: "Draft" });
    expect(req.prompt).toContain(`Suggest ${TITLES_COUNT} different titles`);
    expect(req.prompt).toContain(`at most ${TITLE_MAX} characters`);
    expect(req.prompt).toContain("1A BAT: Cave flier");
    expect(req.prompt).toContain("4A ORE: (no clue yet)");
    expect(req.prompt).toContain('The current title is "Draft"');
    expect(req.prompt).toContain("never be one of the puzzle's own entries");
    expect(req.prompt).not.toContain(NO_THEME);
    expect(req.schema).toMatchObject({ properties: { titles: { type: "array", items: { type: "string" } } }, required: ["titles"] });
    expect(titlesRequest(grid, "", {}).prompt).not.toContain("current title");
  });

  it("vets titles: never an entry, never too long, never the current one, each once", () => {
    const entries = ["BAT", "ORE", "WED", "BOW", "ARE", "TED"];
    expect(vetTitles(entries, [" Night Shift ", "Bat", "b.a.t.", "night shift", "Ore Deal", "x".repeat(TITLE_MAX + 1), "", 7, "Draft", "Wed-ding"], "draft")).toEqual([
      "Night Shift",
      "Ore Deal",
      "Wed-ding",
    ]);
    expect(vetTitles(entries, ["x".repeat(TITLE_MAX)])).toHaveLength(1);
  });

  it("suggestTitles makes one call and vets the answer", async () => {
    const call = fake({ titles: ["Night Shift", "Bat", "After Dark"] });
    expect(await suggestTitles(call, grid, "", { "1A": "Cave flier" }, { current: "After Dark" })).toEqual(["Night Shift"]);
    expect(call.prompts).toHaveLength(1);
    expect(await suggestTitles(fake({ titles: "nope" }), grid, "", {})).toEqual([]);
  });

  it("puzzleContext names the title, the theme and the locked long entries only when present", () => {
    const long = gridFromRows(["HELLO", "A...A", "T...T", "S...S", "WORLD"]);
    long.locked = long.cells.map((_, i) => i < 5);
    expect(puzzleContext(long, " Hi ", "")).toBe("Title: Hi\nTheme entries: HELLO");
    expect(puzzleContext(grid, "", " bats ")).toBe("Theme: bats");
    expect(puzzleContext(grid, "", "  ")).toBe("");
  });
});

describe("vetAlternatives", () => {
  it("keeps clues that pass the checks, trimmed, in the writer's order", () => {
    expect(vetAlternatives("BAT", ["  Cave flier ", "Club for Ruth"])).toEqual(["Cave flier", "Club for Ruth"]);
  });

  it("drops the current clue, repeats, blanks and junk", () => {
    expect(vetAlternatives("BAT", ["Cave flier", "cave flier", "", "   ", 42, null, "Club for Ruth", "Club for Ruth"], "Cave flier")).toEqual(["Club for Ruth"]);
  });

  it("drops a clue that gives the answer away or runs past the limit", () => {
    expect(vetAlternatives("BAT", ["Bat signal?", "One at bat", "x".repeat(60), "Dugout tool"])).toEqual(["Dugout tool"]);
  });
});

describe("drafting clues", () => {
  it("only clues complete entries", () => {
    expect(entryAnswers(gridFromRows(["BA.", "ORE", "WED"]))).toEqual({ "4A": "ORE", "5A": "WED", "1D": "BOW", "2D": "ARE" });
  });

  it("re-asks for clues that fail the checks, and drops any still failing", async () => {
    const call = fake(
      {
        clues: [
          { slot: "1A", standard: "Cave flier", speed: "Night flier" },
          { slot: "4A", standard: "Ore deposit, e.g.", speed: "Mined rock" }, // gives away ORE
          { slot: "5A", standard: "x".repeat(50), speed: "Got hitched" }, // too long
        ],
      },
      {
        clues: [
          { slot: "4A", standard: "Lode load", speed: "Mined rock" },
          { slot: "5A", standard: "Got wed", speed: "Married" }, // still gives the answer away
        ],
      },
    );
    const out = await draftClues(call, grid, "", { slots: ["1A", "4A", "5A"] });
    expect(out).toEqual({ "1A": { standard: "Cave flier", speed: "Night flier" }, "4A": { standard: "Lode load", speed: "Mined rock" } });
    expect(call.prompts).toHaveLength(2);
    expect(call.prompts[1]).toMatch(/4A: .*contains its answer/);
    expect(call.prompts[1]).toMatch(/5A: .*characters/);
  });

  it("ignores slots Claude invents and makes one call when everything passes", async () => {
    const call = fake({ clues: [{ slot: "1A", standard: "Cave flier", speed: "Night flier" }, { slot: "9Z", standard: "?", speed: "?" }] });
    expect(await draftClues(call, grid, "", { slots: ["1A"] })).toEqual({ "1A": { standard: "Cave flier", speed: "Night flier" } });
    expect(call.prompts).toHaveLength(1);
  });

  it("filters suggestions that repeat the current clue or fail the checks", async () => {
    const call = fake({ clues: ["Cave flier", "Club for Ruth", "Bat signal?", "Dugout tool", "Club for Ruth"] });
    // "Bat signal?" gives the answer away.
    expect(await suggestClues(call, grid, "", "1A", { current: "Cave flier" })).toEqual(["Club for Ruth", "Dugout tool"]);
    expect(call.prompts).toHaveLength(1);
  });

  it("answers nothing for a malformed reply or an incomplete entry, without a second call", async () => {
    const call = fake({ clues: "not a list" });
    expect(await suggestClues(call, grid, "", "1A")).toEqual([]);
    expect(await suggestClues(call, gridFromRows(["BA.", "ORE", "WED"]), "", "1A")).toEqual([]);
    expect(call.prompts).toHaveLength(1);
  });
});
