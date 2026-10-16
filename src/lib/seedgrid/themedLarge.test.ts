import { describe, it, expect } from "vitest";
import {
  longestSharedRun,
  looksPartial,
  parseWordSet,
  scoreFill,
  sharedRuns,
  themeSlug,
  validateSeeds,
  PARTIAL_PENALTY,
  BONUS_POINTS,
  DUPLICATE_PENALTY,
  SUBTIER_PENALTY,
  SCORE_CEILING,
  PARTIAL_EXEMPT_SCORE,
  nestedEntries,
} from "./themedLarge";

const FOOTBALL = ["touchdown under", "goal post malone", "kickoffspring", "goal line dance"];

describe("validateSeeds", () => {
  it("normalizes and pairs same-length themers, flagging a shared run over the limit", () => {
    const res = validateSeeds(FOOTBALL);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.seeds).toEqual(["TOUCHDOWNUNDER", "GOALPOSTMALONE", "KICKOFFSPRING", "GOALLINEDANCE"]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("GOALPOSTMALONE and GOALLINEDANCE share GOAL");
    expect(res.errors[0]).toContain("--allow-shared");
  });

  it("keeps the shared run as a warning with allowShared", () => {
    const res = validateSeeds(FOOTBALL, { allowShared: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pairing.pairs).toEqual([
      ["TOUCHDOWNUNDER", "GOALPOSTMALONE"],
      ["KICKOFFSPRING", "GOALLINEDANCE"],
    ]);
    expect(res.pairing.center).toBeNull();
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("GOAL");
  });

  it("lets one odd-length entry sit on the center row", () => {
    const res = validateSeeds(["STARFISH", "DEVILRAY", "SEA HORSE?!", "octopus"]);
    expect(res.ok).toBe(false); // STARFISH/DEVILRAY/SEAHORSE are three 8s
    const ok = validateSeeds(["STARFISH", "DEVILRAY", "octopus"]);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.pairing.pairs).toEqual([["STARFISH", "DEVILRAY"]]);
    expect(ok.pairing.center).toBe("OCTOPUS");
  });

  it("rejects a lone even-length entry in an odd grid", () => {
    const res = validateSeeds(["STARFISH", "DEVILRAY", "SEAHORSE"]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]).toMatch(/SEAHORSE \(8\).*cannot be centered.*odd/);
  });

  it("rejects two unpaired lengths", () => {
    const res = validateSeeds(["KICKOFFSPRING", "GOALPOSTMALONE"]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors[0]).toContain("GOALPOSTMALONE (14)");
    expect(res.errors[0]).toContain("KICKOFFSPRING (13)");
  });

  it("rejects entries longer than the grid, duplicates and empty input", () => {
    const long = validateSeeds(["this entry is far too long for it", "abc"]);
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors[0]).toContain("a 15×15 grid holds 15");
    const dup = validateSeeds(["STARFISH", "star fish"]);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors[0]).toContain("Duplicate");
    expect(validateSeeds([]).ok).toBe(false);
    expect(validateSeeds(["", "  "]).ok).toBe(false);
  });

  it("honors a smaller grid size", () => {
    const res = validateSeeds(["STARFISH", "DEVILRAY"], { size: 9 });
    expect(res.ok).toBe(true);
    const tooLong = validateSeeds(["TOUCHDOWNUNDER"], { size: 9 });
    expect(tooLong.ok).toBe(false);
  });

  it("treats one entry inside another as a shared run", () => {
    const res = validateSeeds(["GOALPOST", "POST"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.includes("share POST"))).toBe(true);
  });
});

describe("longestSharedRun / sharedRuns", () => {
  it("finds the longest common substring", () => {
    expect(longestSharedRun("GOALPOSTMALONE", "GOALLINEDANCE")).toBe("GOAL");
    expect(longestSharedRun("ABC", "XYZ")).toBe("");
    expect(longestSharedRun("TOUCHDOWNUNDER", "KICKOFFSPRING")).toHaveLength(1);
  });

  it("reports only pairs over the limit", () => {
    expect(sharedRuns(["GOALPOSTMALONE", "GOALLINEDANCE", "KICKOFFSPRING"], 3)).toEqual([{ a: "GOALPOSTMALONE", b: "GOALLINEDANCE", run: "GOAL" }]);
    expect(sharedRuns(["GOALPOSTMALONE", "GOALLINEDANCE"], 4)).toEqual([]);
  });
});

describe("looksPartial", () => {
  const vocab = new Set(["TUNING", "NOTE", "END", "ABOUT", "ATONE", "TEASE", "EASE", "ONCE"]);

  it("flags strings of function words and article-plus-word fragments", () => {
    expect(looksPartial("ASDOI", vocab)).toBe(true);
    expect(looksPartial("ORISIT", vocab)).toBe(true);
    expect(looksPartial("ATUNING", vocab)).toBe(true);
    expect(looksPartial("ANOTE", vocab)).toBe(true);
    expect(looksPartial("THEEND", vocab)).toBe(true);
  });

  it("leaves words that are not article-plus-word alone", () => {
    expect(looksPartial("ABOUT", vocab)).toBe(false); // BOUT is not in this vocab
    expect(looksPartial("INTUNE", new Set(["TUNE"]))).toBe(false); // IN + TUNE: not an article
    expect(looksPartial("TUNING", vocab)).toBe(false);
    expect(looksPartial("ONE", vocab)).toBe(false); // too short to judge
  });

  it("is a heuristic: ATONE reads as AT + ONE until a single-word list exempts it", () => {
    expect(looksPartial("ATONE", vocab)).toBe(true);
    expect(looksPartial("ATONE", vocab, new Set(["ATONE"]))).toBe(false);
    expect(looksPartial("ALONE", new Set(["LONE"]))).toBe(true);
    expect(looksPartial("ALONE", new Set(["LONE"]), new Set(["ALONE"]))).toBe(false);
  });
});

describe("scoreFill", () => {
  const scores = new Map([
    ["EASE", 60],
    ["TUNING", 55],
    ["ATUNING", 55],
    ["CATPISS", 94],
    ["LYES", 45],
    ["ANTHEM", 70],
    ["SOFA", 50],
  ]);
  const entry = (slotId: string, answer: string, locked = false) => ({ slotId, answer, locked });

  it("ignores locked themers and scores the rest against the clean tier", () => {
    const res = scoreFill([entry("1A", "TOUCHDOWNUNDER", true), entry("2D", "EASE"), entry("3D", "SOFA")], { scores, ban: new Set() });
    expect(res.total).toBe(10); // (60 - 50) + (50 - 50)
    expect(res.mean).toBe(55);
    expect(res.weak).toEqual([]);
    expect(res.banned).toEqual([]);
  });

  it("charges sub-tier entries double plus a flat penalty and lists them worst first", () => {
    const res = scoreFill([entry("1A", "LYES"), entry("2A", "EASE")], { scores, ban: new Set() });
    expect(res.total).toBe(-5 - 5 - SUBTIER_PENALTY + 10);
    expect(res.weak.map((w) => w.answer)).toEqual(["LYES"]);
    expect(res.weak[0].reasons).toEqual(["scored 45"]);
  });

  it("reports banned words first, however high the list scores them", () => {
    const ban = new Set(["CATPISS", "LYES"]);
    const res = scoreFill([entry("1A", "LYES"), entry("2A", "CATPISS"), entry("3A", "EASE")], { scores, ban });
    expect(res.banned).toEqual(["LYES", "CATPISS"]);
    expect(res.weak[0].answer).toBe("LYES");
    expect(res.weak.map((w) => w.answer)).toEqual(["LYES", "CATPISS"]);
    expect(res.weak[1].reasons).toEqual(["banned"]);
  });

  it("penalizes partials and rewards theme-bonus words", () => {
    const base = scoreFill([entry("1A", "TUNING")], { scores, ban: new Set() });
    const partial = scoreFill([entry("1A", "ATUNING")], { scores, ban: new Set() });
    expect(partial.total).toBe(base.total - PARTIAL_PENALTY);
    expect(partial.partials).toEqual(["ATUNING"]);
    expect(partial.weak[0].reasons).toEqual(["partial-looking"]);
    const bonus = scoreFill([entry("1A", "ANTHEM")], { scores, ban: new Set(), bonus: new Set(["ANTHEM"]) });
    expect(bonus.total).toBe(20 + BONUS_POINTS);
    expect(bonus.bonusHits).toEqual(["ANTHEM"]);
  });

  it("treats words missing from the list as scored 0", () => {
    const res = scoreFill([entry("1A", "ZZZZ")], { scores, ban: new Set() });
    expect(res.weak[0].score).toBe(0);
    expect(res.total).toBe(-100 - SUBTIER_PENALTY);
  });

  it("caps what a lively phrase can contribute", () => {
    const rich = new Map([["GOATCHEESE", 100], ["ANTHEM", SCORE_CEILING]]);
    const a = scoreFill([entry("1A", "GOATCHEESE")], { scores: rich, ban: new Set() });
    const b = scoreFill([entry("1A", "ANTHEM")], { scores: rich, ban: new Set() });
    expect(a.total).toBe(b.total);
    expect(a.total).toBe(SCORE_CEILING - 50);
  });

  it("penalizes an entry that sits inside another engine entry", () => {
    const dict = new Map([["ALE", 60], ["ALEE", 55]]);
    const res = scoreFill([entry("1A", "ALE"), entry("2D", "ALEE")], { scores: dict, ban: new Set() });
    expect(res.total).toBe(10 + 5 - DUPLICATE_PENALTY);
    expect(res.weak).toEqual([{ slotId: "1A", answer: "ALE", score: 60, reasons: ["inside ALEE"] }]);
  });

  it("lets a three-letter word sit inside a locked themer but not a longer one", () => {
    const dict = new Map([["OWN", 60], ["LINE", 60]]);
    const fine = scoreFill([entry("1A", "TOUCHDOWNUNDER", true), entry("2D", "OWN")], { scores: dict, ban: new Set() });
    expect(fine.weak).toEqual([]);
    const dupe = scoreFill([entry("1A", "GOALLINEDANCE", true), entry("2D", "LINE")], { scores: dict, ban: new Set() });
    expect(dupe.weak[0].reasons).toEqual(["inside GOALLINEDANCE"]);
    expect(nestedEntries([entry("1A", "GOALLINEDANCE", true), entry("2D", "LINE"), entry("3D", "OWN")])).toEqual([
      { inner: entry("2D", "LINE"), host: entry("1A", "GOALLINEDANCE", true) },
    ]);
  });

  it("does not second-guess partial-looking entries the list scores highly", () => {
    const dict = new Map([["AMANDA", PARTIAL_EXEMPT_SCORE], ["MANDA", 50], ["ANOTE", PARTIAL_EXEMPT_SCORE - 1], ["NOTE", 60]]);
    const res = scoreFill([entry("1A", "AMANDA"), entry("2A", "ANOTE")], { scores: dict, ban: new Set() });
    expect(res.partials).toEqual(["ANOTE"]);
  });
});

describe("parseWordSet / themeSlug", () => {
  it("reads one entry per line, ignoring comments and scores", () => {
    const set = parseWordSet("# junk\nCATPISS;94\ncat piss\n\nAsDoI\nab\n");
    expect([...set]).toEqual(["CATPISS", "ASDOI"]);
  });

  it("slugs a theme for folder and bonus-file names", () => {
    expect(themeSlug("Football x music")).toBe("football-x-music");
    expect(themeSlug("  Sea creatures named for tarot cards!! ")).toBe("sea-creatures-named-for-tarot-cards");
  });
});
