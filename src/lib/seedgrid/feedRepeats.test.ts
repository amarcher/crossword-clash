import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { DAILY_SLOTS, dailyFeedPath, type DailyFeedEntry } from "../dailyFeed";
import { CLUE_REPEAT_DAYS, CLUE_REPEAT_FROM, clueUses, repeatedClues, repeatProblem, type ClueUse } from "./crosscheck";

/**
 * The repeat rule over the committed feed: from CLUE_REPEAT_FROM on, no clue
 * repeats, word for word, a clue its answer had in any daily within the
 * previous CLUE_REPEAT_DAYS days. Every day before the cutoff still counts as
 * history. `pnpm seedgrid:unrepeat <from> <to>` rewrites what this reports.
 */
describe("the committed feed", () => {
  const root = decodeURIComponent(new URL("../../../public/", import.meta.url).pathname);
  const uses: ClueUse[] = [];
  for (const slot of DAILY_SLOTS) {
    const dir = root + dailyFeedPath(slot, "0000-00-00").slice(1).replace(/[^/]+$/, "");
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)) {
      const day = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(file)?.[1];
      if (!day) continue;
      const entry = JSON.parse(readFileSync(dir + file, "utf8")) as DailyFeedEntry;
      uses.push(...clueUses(day, slot, entry.puzzle));
    }
  }

  it("reads clues from every slot", () => {
    expect(new Set(uses.map((u) => u.slot))).toEqual(new Set(DAILY_SLOTS));
  });

  it(`never repeats a clue for the same answer within ${CLUE_REPEAT_DAYS} days from ${CLUE_REPEAT_FROM} on (fix with \`pnpm seedgrid:unrepeat\`)`, () => {
    const problems = repeatedClues(uses)
      .filter((r) => r.use.day >= CLUE_REPEAT_FROM)
      .map((r) => `${r.use.day} ${repeatProblem(r)}`);
    expect(problems).toEqual([]);
  });
});
