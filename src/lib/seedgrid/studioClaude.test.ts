import { describe, it, expect } from "vitest";
import { gridFromRows } from "./grid";
import { draftClues, entryAnswers, suggestClues, type ClaudeCaller } from "./studioClaude";
import { alternativesRequest, cluesRequest, type ClaudeJsonRequest } from "./cluePrompt";

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
    const req = alternativesRequest(grid, "", "1A", { current: "Cave flier", count: 3 });
    expect(req.prompt).toContain("3 different clues for 1A BAT");
    expect(req.prompt).toContain('"Cave flier"');
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
  });
});
