import { describe, expect, it } from "vitest";
import { gridFromRows } from "./grid";
import { applyRewrites, hooksFor, timelyRequest, vetRewrites, type Rewrite } from "./timely";

const grid = gridFromRows(["CAT", "ORE", "WED"]);
const answers = { "1A": "CAT", "4A": "ORE", "5A": "WED", "1D": "COW", "2D": "ARE", "3D": "TED" };
const clues = {
  "1A": { standard: "Tabby", speed: "Pet that meows" },
  "4A": { standard: "Mined rock", speed: "Miner's find" },
  "5A": { standard: "Tied the knot", speed: "Married" },
  "1D": { standard: "Dairy animal", speed: "Moo-er" },
  "2D": { standard: "Exist", speed: "'We ___ family'" },
  "3D": { standard: "Talk series", speed: "Kennedy or Cruz" },
};

describe("hooksFor", () => {
  it("returns the day's trimmed hooks, or undefined for a missing or blank day", () => {
    expect(hooksFor({ "2026-11-01": "  Marathon day ", "2026-11-02": "   " }, "2026-11-01")).toBe("Marathon day");
    expect(hooksFor({ "2026-11-01": "x" }, "2026-11-02")).toBeUndefined();
    expect(hooksFor({ "2026-11-02": "" }, "2026-11-02")).toBeUndefined();
  });
});

describe("timelyRequest", () => {
  it("lists every entry with both clue tiers, the date, the hooks, the cap and the theme context", () => {
    const req = timelyRequest(grid, { date: "2026-11-01", hooks: "NYC Marathon", clues, max: 2, theme: "Farm", title: "Barnyard", seeds: ["COW"] });
    expect(req.prompt).toContain("runs on 2026-11-01");
    expect(req.prompt).toContain("Timely hooks for that day: NYC Marathon");
    expect(req.prompt).toContain("At most 2 rewrites");
    expect(req.prompt).toContain("Theme: Farm");
    expect(req.prompt).toContain("Title: Barnyard");
    expect(req.prompt).toContain("Theme entries (keep their clues unless a hook improves them): COW");
    expect(req.prompt).toContain("1A CAT: Tabby / Pet that meows");
    expect(req.prompt).toContain("3D TED: Talk series / Kennedy or Cruz");
    expect(req.schema).toMatchObject({ required: ["rewrites"] });
  });

  it("omits the context lines it has nothing for and tolerates a slot without a clue", () => {
    const req = timelyRequest(grid, { date: "2026-11-01", hooks: "x", clues: { "1A": { standard: "Tabby" } }, max: 3 });
    expect(req.prompt).not.toContain("Theme:");
    expect(req.prompt).not.toContain("Theme entries");
    expect(req.prompt).toContain("1A CAT: Tabby / ");
    expect(req.prompt).toContain("4A ORE:  / ");
  });
});

describe("vetRewrites", () => {
  const ok: Rewrite = { slot: "5A", standard: "Married on marathon Sunday?", speed: "Got hitched", why: "marathon" };

  it("accepts a rewrite that passes the clue checks and trims it", () => {
    const res = vetRewrites(answers, [{ ...ok, standard: "  Married on marathon Sunday? " }], 3);
    expect(res.accepted).toEqual([{ ...ok }]);
    expect(res.rejected).toEqual([]);
  });

  it("rejects an unknown slot, a clue that is too long, and a clue that gives the answer away in either tier", () => {
    const res = vetRewrites(
      answers,
      [
        { slot: "9D", standard: "x", speed: "y", why: "" },
        { slot: "1A", standard: "A very long clue that is well over forty-one characters", speed: "y", why: "" },
        { slot: "4A", standard: "Fine", speed: "Ore from a mine", why: "" },
        { slot: "1D", standard: "Cow, basically", speed: "y", why: "" },
      ],
      5,
    );
    expect(res.accepted).toEqual([]);
    expect(res.rejected.map((r) => r.slot)).toEqual(["9D", "1A", "4A", "1D"]);
    expect(res.rejected[0].reason).toBe("not a slot in this puzzle");
    expect(res.rejected[1].reason).toContain("max 41");
    expect(res.rejected[2].reason).toContain("speed clue contains its answer ORE");
    expect(res.rejected[3].reason).toContain("standard clue contains its answer COW");
  });

  it("stops at the cap and takes a slot once", () => {
    const res = vetRewrites(answers, [ok, { ...ok, standard: "Second try" }, { ...ok, slot: "1A", standard: "Kitty" }, { ...ok, slot: "4A", standard: "Lode find" }], 2);
    expect(res.accepted.map((r) => `${r.slot}:${r.standard}`)).toEqual(["5A:Married on marathon Sunday?", "1A:Kitty"]);
    expect(res.rejected).toEqual([{ slot: "5A", reason: "proposed twice" }]);
  });
});

describe("applyRewrites", () => {
  it("replaces only the accepted slots and leaves the input untouched", () => {
    const out = applyRewrites(clues, [{ slot: "5A", standard: "New", speed: "Plain", why: "" }]);
    expect(out["5A"]).toEqual({ standard: "New", speed: "Plain" });
    expect(out["1A"]).toBe(clues["1A"]);
    expect(clues["5A"].standard).toBe("Tied the knot");
  });
});
