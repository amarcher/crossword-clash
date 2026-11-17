import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { DAILY_SLOTS, dailyFeedPath, type DailyFeedEntry } from "../dailyFeed";
import { clueUses, type ClueUse } from "./crosscheck";
import { FIT_FROM, fitFingerprint, fitRequest, unfit, type FitLedger } from "./fitcheck";

const use = (dir: "across" | "down", number: number, answer: string, clue: string): ClueUse => ({ day: "2026-11-16", slot: "midi", dir, index: 0, number, answer, clue });

describe("fitcheck", () => {
  const uses = [use("across", 22, "GIL", "Dodgers great Hodges"), use("across", 23, "INFRA", "Prefix with red")];

  it("fingerprints answers with their clues, so a change to either asks for a new check", () => {
    const print = fitFingerprint(uses);
    expect(print).toMatch(/^[0-9a-f]{16}$/);
    expect(fitFingerprint([...uses])).toBe(print);
    expect(fitFingerprint([uses[0], { ...uses[1], clue: "Serve no one can return" }])).not.toBe(print);
    expect(fitFingerprint([{ ...uses[0], answer: "GILL" }, uses[1]])).not.toBe(print);
    // The slip itself: the same clues, one entry early.
    expect(fitFingerprint([{ ...uses[0], clue: uses[1].clue }, { ...uses[1], clue: uses[0].clue }])).not.toBe(print);
  });

  it("asks the reader about every entry by id, answer and clue", () => {
    const { prompt } = fitRequest("Hearth and Home", uses);
    expect(prompt).toContain("22A  GIL  —  Dodgers great Hodges");
    expect(prompt).toContain("23A  INFRA  —  Prefix with red");
  });

  it("lists the days with no pass on record, or whose clues changed since", () => {
    const files = [{ day: "2026-11-16", slot: "midi", uses }, { day: "2026-11-17", slot: "mini", uses }];
    const ledger: FitLedger = { "2026-11-16/midi": fitFingerprint(uses), "2026-11-17/mini": "stale" };
    expect(unfit(ledger, files, "2026-11-01")).toEqual(["2026-11-17/mini"]);
    expect(unfit(ledger, files, "2026-11-18")).toEqual([]);
    expect(unfit({}, files, "2026-11-01")).toEqual(["2026-11-16/midi", "2026-11-17/mini"]);
  });
});

/**
 * The committed feed against the ledger: every daily from FIT_FROM on has
 * passed the clue-fit check with the clues it has now. A new or edited
 * puzzle fails here until `pnpm seedgrid:fitcheck <from> <to>` passes it.
 */
describe("the committed feed's clues", () => {
  const root = decodeURIComponent(new URL("../../../public/", import.meta.url).pathname);
  const ledger = JSON.parse(readFileSync(decodeURIComponent(new URL("../../../scripts/seedgrid/fit-ledger.json", import.meta.url).pathname), "utf8")) as FitLedger;
  const files: { day: string; slot: string; uses: ClueUse[]; counts: boolean }[] = [];
  for (const slot of DAILY_SLOTS) {
    const dir = root + dailyFeedPath(slot, "0000-00-00").slice(1).replace(/[^/]+$/, "");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const day = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file)?.[1];
      if (!day) continue;
      const { puzzle } = JSON.parse(readFileSync(dir + file, "utf8")) as DailyFeedEntry;
      const counts = (["across", "down"] as const).every((d) => (puzzle.clues[d]?.length ?? 0) === (puzzle.answers[d]?.length ?? 0));
      files.push({ day, slot, uses: clueUses(day, slot, puzzle), counts });
    }
  }

  it("has as many clues as answers in every daily", () => {
    expect(files.filter((f) => !f.counts).map((f) => `${f.day}/${f.slot}`)).toEqual([]);
  });

  it(`has passed the clue-fit check, as it stands, from ${FIT_FROM} on (run \`pnpm seedgrid:fitcheck <from> <to>\`)`, () => {
    expect(unfit(ledger, files)).toEqual([]);
  });
});
