import { describe, expect, it } from "vitest";
import { gridFromRows, gridToRows, slotsOf } from "./grid";
import { cluesFromIpuz, gridFromIpuz, SPEED_CLUES_KEY, toIpuz } from "./ipuz";
import { contentReviewRequest, CONTENT_RULE, timelyContext } from "./cluePrompt";

const grid = gridFromRows(["CAT", "ORE", "WED"]);
const clues = {
  "1A": { standard: "Tabby", speed: "Pet that meows" },
  "4A": { standard: "Mined rock" },
  "5A": { standard: "Tied the knot", speed: "Married" },
  "1D": { standard: "Dairy animal", speed: "Moo-er" },
  "2D": { standard: "Exist", speed: "'We ___ family'" },
  "3D": { standard: "Talk series", speed: "Kennedy or Cruz" },
};

describe("gridFromIpuz / cluesFromIpuz", () => {
  it("read back what toIpuz wrote", () => {
    const ipuz = toIpuz(grid, clues, { title: "T", author: "A", theme: "Farm" });
    const back = gridFromIpuz(ipuz);
    expect(gridToRows(back)).toEqual(["CAT", "ORE", "WED"]);
    expect(back.locked.every((l) => !l)).toBe(true);
    expect(cluesFromIpuz(ipuz, back)).toEqual(clues);
  });

  it("treats '#', null and 0 as black and tolerates a file without the speed extension", () => {
    const back = gridFromIpuz({ solution: [["#", "A", "B"], [null, "C", "D"], [0, "E", "F"]] });
    expect(gridToRows(back)).toEqual(["#AB", "#CD", "#EF"]);
    const only = cluesFromIpuz({ clues: { Across: [[1, "First"]], Down: [] } }, back);
    expect(only).toEqual({ "1A": { standard: "First" } });
  });

  it("skips slots the file has no clue for, including toIpuz's answer placeholders", () => {
    const ipuz = toIpuz(grid, { "1A": { standard: "Tabby" } }, { title: "T", author: "A" });
    expect(ipuz.clues.Across).toEqual([[1, "Tabby"], [4, "ORE"], [5, "WED"]]);
    expect(cluesFromIpuz(ipuz, grid)).toEqual({ "1A": { standard: "Tabby" } });
    ipuz.clues.Down = [];
    ipuz[SPEED_CLUES_KEY].Down = [];
    expect(cluesFromIpuz(ipuz, grid)).toEqual({ "1A": { standard: "Tabby" } });
    expect(slotsOf(grid)).toHaveLength(6);
  });
});

describe("contentReviewRequest", () => {
  it("shows the editor every entry with both tiers and asks for a list of flagged slots", () => {
    const req = contentReviewRequest(grid, `Theme: Farm\n${CONTENT_RULE}`, { "1A": "CAT", "4A": "ORE" }, clues);
    expect(req.prompt).toContain("Theme: Farm");
    expect(req.prompt).toContain("CAT\nORE\nWED");
    expect(req.prompt).toContain("1A CAT: Tabby / Pet that meows");
    expect(req.prompt).toContain("4A ORE: Mined rock / ");
    expect(req.prompt).toContain("Return an empty list when all are fine");
    expect(req.schema).toMatchObject({ required: ["problems"] });
  });

  it("marks a missing clue", () => {
    const req = contentReviewRequest(grid, "", { "5A": "WED" }, {});
    expect(req.prompt).toContain("5A WED: (missing) / ");
  });
});

describe("timelyContext", () => {
  it("wraps the hooks in the light-touch instruction", () => {
    expect(timelyContext("Halloween")).toMatch(/^Timely hooks for the day this puzzle runs .*: Halloween$/);
  });
});
