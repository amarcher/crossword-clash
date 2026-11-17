/**
 * Checks that every clue of the feed's dailies fits its own answer, and
 * records each pass in fit-ledger.json (src/lib/seedgrid/fitcheck.ts).
 *
 *   pnpm seedgrid:fitcheck <YYYY-MM-DD> [<YYYY-MM-DD>] [--all]
 *   pnpm seedgrid:fitcheck --accept 2026-12-01/midi
 *
 * A puzzle already passed with its present clues is skipped unless --all.
 * A puzzle with problems is listed and left out of the ledger: fix its clues
 * (`pnpm seedgrid:reclue`, or by hand) and run this again. --accept records
 * a pass by hand, for a flag that was read and judged wrong.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertApiKey, callJson, usage } from "./claude.mts";
import { loadFeed } from "./feedHistory.mts";
import { parseArgs } from "./puzzleDir.mts";
import { clueUses } from "../../src/lib/seedgrid/crosscheck";
import { fitFingerprint, fitKey, fitRequest, type FitLedger, type FitProblem } from "../../src/lib/seedgrid/fitcheck";

const USAGE = "Usage: pnpm seedgrid:fitcheck <YYYY-MM-DD> [<YYYY-MM-DD>] [--all] | --accept <YYYY-MM-DD>/<slot>";
const ledgerFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fit-ledger.json");
const ledger: FitLedger = fs.existsSync(ledgerFile) ? JSON.parse(fs.readFileSync(ledgerFile, "utf8")) : {};
const save = () => fs.writeFileSync(ledgerFile, `${JSON.stringify(Object.fromEntries(Object.entries(ledger).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);

const { flags, positional } = parseArgs(process.argv.slice(2));
const feed = loadFeed().map((f) => ({ ...f, uses: clueUses(f.day, f.slot, f.entry.puzzle) }));

if (flags.accept) {
  const f = feed.find((x) => fitKey(x.day, x.slot) === flags.accept);
  if (!f) {
    console.error(`No daily ${flags.accept}. ${USAGE}`);
    process.exit(1);
  }
  ledger[flags.accept] = fitFingerprint(f.uses);
  save();
  console.log(`${flags.accept} recorded as passed by hand.`);
  process.exit(0);
}

const [from, to = from] = positional;
if (!from || ![from, to].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
  console.error(USAGE);
  process.exit(1);
}
assertApiKey();

const todo = feed.filter((f) => f.day >= from && f.day <= to && (flags.all === "true" || ledger[fitKey(f.day, f.slot)] !== fitFingerprint(f.uses)));
let flagged = 0;
// A few at a time: each is one call.
for (let i = 0; i < todo.length; i += 6) {
  await Promise.all(
    todo.slice(i, i + 6).map(async (f) => {
      const key = fitKey(f.day, f.slot);
      // Clue and answer counts that differ are a slip before any reading.
      const counts = (["across", "down"] as const).filter((d) => (f.entry.puzzle.clues[d]?.length ?? 0) !== (f.entry.puzzle.answers[d]?.length ?? 0));
      const { problems } = counts.length ? { problems: counts.map((d): FitProblem => ({ id: d, problem: "clue and answer counts differ" })) } : await callJson<{ problems: FitProblem[] }>(fitRequest(f.entry.puzzle.title ?? "", f.uses));
      if (problems.length === 0) {
        ledger[key] = fitFingerprint(f.uses);
        console.log(`${key}  ok  (${f.uses.length} clues)`);
        return;
      }
      flagged++;
      delete ledger[key];
      console.log(`${key}  ${f.entry.puzzle.title}`);
      for (const p of problems) {
        const u = f.uses.find((x) => `${x.number}${x.dir === "across" ? "A" : "D"}` === p.id);
        console.log(`  !! ${p.id} ${u ? `${u.answer} — ${u.clue}` : ""}\n       ${p.problem}`);
      }
    }),
  );
  save();
}
console.log(`${todo.length} puzzle(s) checked, ${flagged} with problems. Tokens: ${usage.input} in, ${usage.output} out.`);
if (flagged) process.exit(1);
